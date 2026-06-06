import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { safeParseRagRetrievalResponse } from "../../src/contracts/rag.js";
import { chunkDocuments } from "../../src/rag/chunker.js";
import { loadCorpusDocuments } from "../../src/rag/corpusLoader.js";
import { retrieveChunks } from "../../src/rag/retriever.js";
import { retrieveHybrid } from "../../src/rag/hybridRetriever.js";
import { computeCorpusHash } from "../../src/rag/semanticRetriever.js";
import { buildGraphIndex } from "../../src/rag/graphIndex/store.js";
import { hashingEmbedder } from "../../src/rag/embedder/hashingEmbedder.js";
import { type VectorIndexEntry } from "../../src/rag/vectorIndex/store.js";

const REPO_ROOT = resolve(__dirname, "..", "..");

const DEFAULT_GRAPH_DICTIONARY = [
  "alpha",
  "beta",
  "gamma",
  "delta",
  "retrieval",
  "ranking",
  "lexical",
  "citations",
];

function runRagQuery(args: string[]): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execFileSync("node", ["--import", "tsx", "src/cli/ragQuery.ts", ...args], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120_000,
    });
    return { stdout, stderr: "", status: 0 };
  } catch (error) {
    const err = error as { status?: number; stdout?: string; stderr?: string };
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      status: err.status ?? 1,
    };
  }
}

describe("ragQuery CLI", () => {
  it("prints citation-ready JSON equivalent to the API boundary", async () => {
    const documents = await loadCorpusDocuments();
    const expected = retrieveChunks(
      { text: "stable citations", top_k: 2 },
      chunkDocuments(documents),
    );

    const result = runRagQuery(["--query", "stable citations", "--top-k", "2"]);
    const json = JSON.parse(result.stdout) as unknown;
    const parsed = safeParseRagRetrievalResponse(json);

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(JSON.stringify(json));
    expect(parsed.ok).toBe(true);
    expect(json).toEqual(expected);
  });

  it("honors a custom corpus directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "rag-query-corpus-"));
    try {
      await writeFile(
        join(dir, "custom.json"),
        JSON.stringify({
          id: "doc-custom",
          title: "Custom CLI Corpus",
          source_path: "custom.json",
          text: "Custom command line retrieval proves corpus directory support.",
        }),
      );

      const result = runRagQuery([
        "--query",
        "command line retrieval",
        "--top-k",
        "1",
        "--corpus-dir",
        dir,
      ]);
      const response = JSON.parse(result.stdout) as { results: Array<{ citation: { document_id: string } }> };

      expect(result.status).toBe(0);
      expect(response.results).toHaveLength(1);
      expect(response.results[0]?.citation.document_id).toBe("doc-custom");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("writes validation errors to stderr without emitting retrieval JSON", () => {
    const result = runRagQuery(["--query", "", "--top-k", "0"]);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/query/i);
    expect(result.stderr).toMatch(/top-k|top_k/i);
  });

  it("defaults to lexical mode and does NOT emit a signals block", async () => {
    const documents = await loadCorpusDocuments();
    const expected = retrieveChunks(
      { text: "stable citations", top_k: 2 },
      chunkDocuments(documents),
    );

    const result = runRagQuery(["--query", "stable citations", "--top-k", "2"]);
    const json = JSON.parse(result.stdout) as Record<string, unknown>;

    expect(result.status).toBe(0);
    expect(json).toEqual(expected);
    for (const r of expected.results) {
      expect(r).not.toHaveProperty("signals");
    }
  });

  it("explicit --mode lexical matches the legacy baseline (no signals)", async () => {
    const documents = await loadCorpusDocuments();
    const expected = retrieveChunks(
      { text: "stable citations", top_k: 2 },
      chunkDocuments(documents),
    );

    const result = runRagQuery([
      "--query",
      "stable citations",
      "--top-k",
      "2",
      "--mode",
      "lexical",
    ]);
    const json = JSON.parse(result.stdout) as Record<string, unknown>;

    expect(result.status).toBe(0);
    expect(json).toEqual(expected);
  });

  it("--mode hybrid emits signals.fused and matches retrieveHybrid()", async () => {
    const documents = await loadCorpusDocuments();
    const chunks = chunkDocuments(documents);
    const corpusHash = computeCorpusHash(chunks);
    const entries: VectorIndexEntry[] = chunks.map((c) => ({
      id: c.id,
      vector: hashingEmbedder.embed(c.text),
    }));
    const graph = buildGraphIndex(chunks, {
      corpusHash,
      dictionary: DEFAULT_GRAPH_DICTIONARY,
    });
    const expected = retrieveHybrid(
      { text: "stable citations", top_k: 2 },
      chunks,
      {
        embedder: hashingEmbedder,
        mode: "hybrid",
        prebuiltEntries: entries,
        prebuiltGraph: graph,
        corpusHash,
      },
    );

    const result = runRagQuery([
      "--query",
      "stable citations",
      "--top-k",
      "2",
      "--mode",
      "hybrid",
      "--embedder",
      "default",
    ]);
    const json = JSON.parse(result.stdout) as Record<string, unknown>;
    const parsed = safeParseRagRetrievalResponse(json);

    expect(result.status).toBe(0);
    expect(parsed.ok).toBe(true);
    expect(json).toEqual(expected);

    const results = (json as { results: Array<{ signals?: { fused?: Array<{ score: number; chunk_id: string }> }; score: number; chunk_id: string }> }).results;
    for (const r of results) {
      const fused = r.signals?.fused ?? [];
      const self = fused.find((s) => s.chunk_id === r.chunk_id);
      expect(self).toBeDefined();
      expect(r.score).toBeCloseTo(self?.score ?? -1, 6);
    }
  });

  it("--mode semantic emits signals.semantic on each result", async () => {
    const result = runRagQuery([
      "--query",
      "stable citations",
      "--top-k",
      "2",
      "--mode",
      "semantic",
      "--embedder",
      "hashing",
    ]);
    const json = JSON.parse(result.stdout) as {
      results: Array<{ signals?: { semantic?: unknown[]; lexical?: unknown[] }; citation: { document_id: string } }>;
    };

    expect(result.status).toBe(0);
    expect(json.results.length).toBeGreaterThan(0);
    for (const r of json.results) {
      expect(Array.isArray(r.signals?.semantic)).toBe(true);
      expect(r.citation.document_id.length).toBeGreaterThan(0);
    }
  });

  it("--mode graph emits signals.graph on each result", async () => {
    const result = runRagQuery([
      "--query",
      "stable citations",
      "--top-k",
      "2",
      "--mode",
      "graph",
      "--embedder",
      "default",
    ]);
    const json = JSON.parse(result.stdout) as {
      results: Array<{ signals?: { graph?: unknown[]; lexical?: unknown[] }; citation: { document_id: string } }>;
    };

    expect(result.status).toBe(0);
    expect(json.results.length).toBeGreaterThan(0);
    for (const r of json.results) {
      expect(Array.isArray(r.signals?.graph)).toBe(true);
      expect(r.citation.document_id.length).toBeGreaterThan(0);
    }
  });

  it("--embedder hashing resolves the registered hashing embedder", async () => {
    const result = runRagQuery([
      "--query",
      "stable citations",
      "--top-k",
      "2",
      "--mode",
      "semantic",
      "--embedder",
      "hashing",
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/\"chunk_id\"/);
  });

  it("rejects an unknown --mode with a stderr error and no stdout JSON", () => {
    const result = runRagQuery([
      "--query",
      "stable citations",
      "--top-k",
      "2",
      "--mode",
      "bogus",
    ]);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/--mode/i);
  });

  it("rejects an unregistered --embedder with a stderr error and no stdout JSON", () => {
    const result = runRagQuery([
      "--query",
      "stable citations",
      "--top-k",
      "2",
      "--mode",
      "hybrid",
      "--embedder",
      "no-such-embedder",
    ]);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/embedder/i);
  });
});
