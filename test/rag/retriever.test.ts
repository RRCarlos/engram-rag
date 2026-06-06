import { describe, expect, it } from "vitest";
import { parseDocumentChunk, safeParseRagRetrievalResponse } from "../../src/contracts/rag.js";
import { retrieveChunks } from "../../src/rag/retriever.js";

const alphaChunk = parseDocumentChunk({
  id: "doc-alpha#chunk-0001",
  document_id: "doc-alpha",
  title: "Alpha Retrieval Notes",
  source_path: "fixtures/corpus/alpha.json",
  chunk_index: 0,
  text: "Alpha retrieval uses stable citations. Shared ranking language mentions retrieval and citations together.",
  citation: {
    document_id: "doc-alpha",
    title: "Alpha Retrieval Notes",
    source_path: "fixtures/corpus/alpha.json",
    start_offset: 0,
    end_offset: 95,
    start_line: 1,
    end_line: 1,
  },
});

const betaChunk = parseDocumentChunk({
  id: "doc-beta#chunk-0001",
  document_id: "doc-beta",
  title: "Beta Retrieval Guide",
  source_path: "fixtures/corpus/beta.json",
  chunk_index: 0,
  text: "Beta retrieval explains deterministic chunks. Shared ranking language mentions retrieval and citations together.",
  citation: {
    document_id: "doc-beta",
    title: "Beta Retrieval Guide",
    source_path: "fixtures/corpus/beta.json",
    start_offset: 0,
    end_offset: 98,
    start_line: 1,
    end_line: 1,
  },
});

const gammaChunk = parseDocumentChunk({
  id: "doc-gamma#chunk-0001",
  document_id: "doc-gamma",
  title: "Gamma Retrieval Reference",
  source_path: "fixtures/corpus/gamma.json",
  chunk_index: 0,
  text: "Gamma covers lexical ties. Shared ranking language mentions retrieval and citations together.",
  citation: {
    document_id: "doc-gamma",
    title: "Gamma Retrieval Reference",
    source_path: "fixtures/corpus/gamma.json",
    start_offset: 0,
    end_offset: 86,
    start_line: 1,
    end_line: 1,
  },
});

const chunks = [gammaChunk, betaChunk, alphaChunk];

describe("retriever", () => {
  it("returns top-k chunks ordered by descending lexical score with citation fields", () => {
    const response = retrieveChunks({ text: "stable citations", top_k: 2 }, chunks);

    expect(response.query).toBe("stable citations");
    expect(response.top_k).toBe(2);
    expect(response.results.map((result) => result.chunk_id)).toEqual([
      "doc-alpha#chunk-0001",
      "doc-beta#chunk-0001",
    ]);
    expect(response.results.map((result) => result.score)).toEqual([3, 1]);
    expect(response.results[0]?.snippet).toContain("stable citations");
    expect(response.results[0]?.citation).toMatchObject({
      document_id: "doc-alpha",
      title: "Alpha Retrieval Notes",
      source_path: "fixtures/corpus/alpha.json",
    });
  });

  it("uses chunk ID as the stable tie-breaker for equal lexical scores", () => {
    const first = retrieveChunks({ text: "shared ranking language mentions", top_k: 3 }, chunks);
    const second = retrieveChunks({ text: "shared ranking language mentions", top_k: 3 }, chunks);

    expect(first.results.map((result) => result.score)).toEqual([4, 4, 4]);
    expect(first.results.map((result) => result.chunk_id)).toEqual([
      "doc-alpha#chunk-0001",
      "doc-beta#chunk-0001",
      "doc-gamma#chunk-0001",
    ]);
    expect(second.results).toEqual(first.results);
  });

  it("returns a valid empty response when no chunks match", () => {
    const response = retrieveChunks({ text: "nonexistent nebula", top_k: 2 }, chunks);
    const parsed = safeParseRagRetrievalResponse(response);

    expect(response.results).toEqual([]);
    expect(parsed.ok).toBe(true);
    expect("answer" in response).toBe(false);
    expect("embeddings" in response).toBe(false);
    expect("graph" in response).toBe(false);
  });
});
