import { describe, expect, it } from "vitest";
import { chunkDocuments } from "../../src/rag/chunker.js";
import { loadCorpusDocuments } from "../../src/rag/corpusLoader.js";
import { evaluateRagScenarios } from "../../src/rag/ragEval.js";

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
});
