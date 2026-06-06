import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { chunkDocuments } from "../../src/rag/chunker.js";
import { loadCorpusDocuments } from "../../src/rag/corpusLoader.js";
import { evaluateRagScenarios, type RagEvalScenario } from "../../src/rag/ragEval.js";
import { hashingEmbedder } from "../../src/rag/embedder/hashingEmbedder.js";
import { buildGraphIndex } from "../../src/rag/graphIndex/store.js";
import { computeCorpusHash } from "../../src/rag/semanticRetriever.js";
import { type VectorIndexEntry } from "../../src/rag/vectorIndex/store.js";

const REPO_ROOT = resolve(__dirname, "..", "..");

const RAG_GRAPH_DICTIONARY = [
  "alpha",
  "beta",
  "gamma",
  "delta",
  "retrieval",
  "ranking",
  "lexical",
  "citations",
];

async function loadScenariosFromDisk(relativePath: string): Promise<RagEvalScenario[]> {
  const raw = await readFile(join(REPO_ROOT, relativePath), "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`eval scenarios file must be a top-level array: ${relativePath}`);
  }
  return parsed as RagEvalScenario[];
}

describe("RAG eval scenarios", () => {
  it("passes recall and citation-ready checks for matching fixture queries", async () => {
    const chunks = chunkDocuments(await loadCorpusDocuments());

    const report = evaluateRagScenarios(
      [
        {
          id: "stable-citations-alpha",
          query: "stable citations",
          top_k: 2,
          expected_chunk_ids: ["doc-alpha#chunk-0001"],
        },
        {
          id: "deterministic-metadata-beta",
          query: "deterministic source metadata",
          top_k: 2,
          expected_chunk_ids: ["doc-beta#chunk-0001"],
        },
      ],
      chunks,
    );

    expect(report.scenarios_total).toBe(2);
    expect(report.scenarios_passed).toBe(2);
    expect(report.results.map((result) => result.status)).toEqual(["PASS", "PASS"]);
    expect(report.results[0]?.matched_chunk_ids).toContain("doc-alpha#chunk-0001");
    expect(report.results[1]?.citations).toEqual([
      {
        chunk_id: "doc-beta#chunk-0001",
        document_id: "doc-beta",
        source_path: "fixtures/corpus/beta.json",
      },
    ]);
  });

  it("fails scenarios that miss required recall while keeping valid citation data", async () => {
    const chunks = chunkDocuments(await loadCorpusDocuments());

    const report = evaluateRagScenarios(
      [
        {
          id: "missing-gamma-recall",
          query: "stable citations",
          top_k: 1,
          expected_chunk_ids: ["doc-gamma#chunk-0001"],
        },
      ],
      chunks,
    );

    expect(report.scenarios_total).toBe(1);
    expect(report.scenarios_passed).toBe(0);
    expect(report.results[0]?.status).toBe("FAIL");
    expect(report.results[0]?.missing_chunk_ids).toEqual(["doc-gamma#chunk-0001"]);
    expect(report.results[0]?.citations[0]).toMatchObject({
      document_id: "doc-alpha",
      source_path: "fixtures/corpus/alpha.json",
    });
    expect("answer" in report.results[0]!).toBe(false);
    expect("prompt" in report.results[0]!).toBe(false);
    expect("graph" in report.results[0]!).toBe(false);
  });

  it("passes recall and citation for hybrid mode with fused score == top-level score", async () => {
    const scenarios = await loadScenariosFromDisk("eval/rag-scenarios/hybrid.json");
    const chunks = chunkDocuments(await loadCorpusDocuments());
    const corpusHash = computeCorpusHash(chunks);
    const entries: VectorIndexEntry[] = chunks.map((c) => ({
      id: c.id,
      vector: hashingEmbedder.embed(c.text),
    }));
    const graph = buildGraphIndex(chunks, {
      corpusHash,
      dictionary: RAG_GRAPH_DICTIONARY,
    });

    const report = evaluateRagScenarios(scenarios, chunks, {
      embedder: hashingEmbedder,
      prebuiltEntries: entries,
      prebuiltGraph: graph,
      corpusHash,
    });

    expect(report.scenarios_total).toBe(3);
    expect(report.scenarios_passed).toBe(3);
    expect(report.results.map((result) => result.status)).toEqual(["PASS", "PASS", "PASS"]);

    for (const result of report.results) {
      expect(result.mode).toBe("hybrid");
      // Every scored chunk in hybrid mode MUST have a fused score that
      // matches the top-level result score, per the spec scenario "Fuse
      // three signals with RRF".
      expect(result.scores).toBeDefined();
      expect(result.scores?.length ?? 0).toBeGreaterThan(0);
      for (const score of result.scores ?? []) {
        expect(score.fused_score).not.toBeNull();
        expect(score.top_level_score).toBeCloseTo(score.fused_score ?? -1, 6);
      }
      // Citations MUST still be present and well-formed for matched chunks.
      expect(result.citations.length).toBeGreaterThan(0);
      for (const citation of result.citations) {
        expect(citation.document_id.length).toBeGreaterThan(0);
        expect(citation.source_path.length).toBeGreaterThan(0);
      }
    }
  });

  it("a single hybrid scenario run surfaces fused scores for matched and unmatched results", async () => {
    const scenarios = await loadScenariosFromDisk("eval/rag-scenarios/hybrid.json");
    const first = scenarios[0];
    expect(first).toBeDefined();

    const chunks = chunkDocuments(await loadCorpusDocuments());
    const corpusHash = computeCorpusHash(chunks);
    const entries: VectorIndexEntry[] = chunks.map((c) => ({
      id: c.id,
      vector: hashingEmbedder.embed(c.text),
    }));
    const graph = buildGraphIndex(chunks, {
      corpusHash,
      dictionary: RAG_GRAPH_DICTIONARY,
    });

    const report = evaluateRagScenarios([first!], chunks, {
      embedder: hashingEmbedder,
      prebuiltEntries: entries,
      prebuiltGraph: graph,
      corpusHash,
    });

    const result = report.results[0];
    expect(result).toBeDefined();
    expect(result?.status).toBe("PASS");
    expect(result?.mode).toBe("hybrid");
    // At least one result must have a non-null fused_score and it must
    // round-trip through the top-level score.
    const withFused = (result?.scores ?? []).filter((s) => s.fused_score !== null);
    expect(withFused.length).toBeGreaterThan(0);
  });

  it("lexical scenarios report mode='lexical' and fused_score=null per chunk", async () => {
    const chunks = chunkDocuments(await loadCorpusDocuments());

    const report = evaluateRagScenarios(
      [
        {
          id: "lexical-baseline",
          query: "stable citations",
          top_k: 2,
          expected_chunk_ids: ["doc-alpha#chunk-0001"],
        },
      ],
      chunks,
    );

    const result = report.results[0];
    expect(result).toBeDefined();
    expect(result?.mode).toBe("lexical");
    expect(result?.scores).toBeDefined();
    for (const score of result?.scores ?? []) {
      expect(score.fused_score).toBeNull();
      expect(score.top_level_score).toBeGreaterThan(0);
    }
  });
});
