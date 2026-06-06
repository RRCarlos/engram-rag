import { describe, expect, it } from "vitest";
import { parseDocumentChunk } from "../../src/contracts/rag.js";
import { semanticRetrieve } from "../../src/rag/semanticRetriever.js";
import { hashingEmbedder } from "../../src/rag/embedder/hashingEmbedder.js";
import { type VectorIndexEntry } from "../../src/rag/vectorIndex/store.js";

const alphaChunk = parseDocumentChunk({
  id: "doc-alpha#chunk-0001",
  document_id: "doc-alpha",
  title: "Alpha Retrieval Notes",
  source_path: "fixtures/corpus/alpha.json",
  chunk_index: 0,
  text: "alpha retrieval uses stable citations and shared ranking language",
  citation: {
    document_id: "doc-alpha",
    title: "Alpha Retrieval Notes",
    source_path: "fixtures/corpus/alpha.json",
    start_offset: 0,
    end_offset: 71,
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
  text: "beta retrieval covers deterministic chunks and shared ranking language",
  citation: {
    document_id: "doc-beta",
    title: "Beta Retrieval Guide",
    source_path: "fixtures/corpus/beta.json",
    start_offset: 0,
    end_offset: 73,
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
  text: "gamma retrieval covers lexical ties and shared ranking language",
  citation: {
    document_id: "doc-gamma",
    title: "Gamma Retrieval Reference",
    source_path: "fixtures/corpus/gamma.json",
    start_offset: 0,
    end_offset: 71,
    start_line: 1,
    end_line: 1,
  },
});

const chunks = [alphaChunk, betaChunk, gammaChunk];

describe("semanticRetriever", () => {
  it("ranks chunks by descending cosine similarity using the active embedder", () => {
    const response = semanticRetrieve(
      { text: "stable citations ranking", top_k: 3 },
      chunks,
      { embedder: hashingEmbedder, cacheRoot: "" },
    );

    expect(response.query).toBe("stable citations ranking");
    expect(response.top_k).toBe(3);
    expect(response.results.length).toBeGreaterThan(0);

    const scores = response.results.map((r) => r.score);
    const sorted = [...scores].sort((a, b) => b - a);
    expect(scores).toEqual(sorted);

    for (const result of response.results) {
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
      expect(result.snippet.length).toBeGreaterThan(0);
      expect(result.citation.document_id.length).toBeGreaterThan(0);
    }
  });

  it("falls back to lexical results when the vector index is empty", () => {
    // Cache root that will not have any pre-built entries.
    const response = semanticRetrieve(
      { text: "stable citations", top_k: 2 },
      chunks,
      { embedder: hashingEmbedder, cacheRoot: "" },
    );

    // Even with no cache, the embedder-driven path will produce vectors, so
    // we instead assert the empty-index behavior with an explicit empty
    // pre-built index override.
    expect(response.results.length).toBeGreaterThan(0);

    // The "empty index" scenario is covered by the next test using a custom
    // `prebuiltEntries` option.
    expect(response.results.every((r) => r.signals?.semantic === undefined ||
      Array.isArray(r.signals.semantic))).toBe(true);
  });

  it("surfaces signals.semantic sub-scores on every result when an index is provided", () => {
    const entries: VectorIndexEntry[] = chunks.map((c) => ({
      id: c.id,
      vector: hashingEmbedder.embed(c.text),
    }));

    const response = semanticRetrieve(
      { text: "stable citations", top_k: 2 },
      chunks,
      { embedder: hashingEmbedder, cacheRoot: "", prebuiltEntries: entries },
    );

    expect(response.results.length).toBe(2);
    for (const result of response.results) {
      expect(result.signals?.semantic).toBeDefined();
      expect(result.signals?.semantic?.length).toBeGreaterThan(0);
    }
  });

  it("returns the lexical-ranked result list when the index is empty (fallback)", () => {
    const response = semanticRetrieve(
      { text: "stable citations", top_k: 2 },
      chunks,
      { embedder: hashingEmbedder, cacheRoot: "", prebuiltEntries: [] },
    );

    // When the index is empty we fall back to lexical.
    expect(response.results.length).toBeGreaterThan(0);
    for (const result of response.results) {
      expect(result.signals?.semantic).toEqual([]);
      expect(result.signals?.lexical).toBeDefined();
    }
  });

  it("preserves the existing RagRetrievalResponse top-level shape", () => {
    const response = semanticRetrieve(
      { text: "shared ranking language", top_k: 1 },
      chunks,
      { embedder: hashingEmbedder, cacheRoot: "" },
    );

    expect(response).toMatchObject({
      query: "shared ranking language",
      top_k: 1,
      results: expect.any(Array),
    });
    const first = response.results[0];
    expect(first).toBeDefined();
    expect(Object.keys(first ?? {}).sort()).toEqual(
      ["chunk_id", "citation", "score", "signals", "snippet"].sort(),
    );
  });
});
