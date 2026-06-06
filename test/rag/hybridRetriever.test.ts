import { describe, expect, it } from "vitest";
import { parseDocumentChunk } from "../../src/contracts/rag.js";
import { hashingEmbedder } from "../../src/rag/embedder/hashingEmbedder.js";
import { buildGraphIndex, type GraphIndex } from "../../src/rag/graphIndex/store.js";
import { retrieveHybrid } from "../../src/rag/hybridRetriever.js";
import { type VectorIndexEntry } from "../../src/rag/vectorIndex/store.js";
import { DEFAULT_RRF_K, fuseRankings } from "../../src/rag/rrf.js";
import { type RagSignalScore } from "../../src/contracts/rag.js";

const makeChunk = (
  id: string,
  documentId: string,
  text: string,
) =>
  parseDocumentChunk({
    id,
    document_id: documentId,
    title: documentId,
    source_path: `fixtures/corpus/${documentId}.json`,
    chunk_index: 0,
    text,
    citation: {
      document_id: documentId,
      title: documentId,
      source_path: `fixtures/corpus/${documentId}.json`,
      start_offset: 0,
      end_offset: text.length,
      start_line: 1,
      end_line: 1,
    },
  });

const CHUNKS = [
  makeChunk("doc-a#chunk-0001", "doc-a", "engram and graph and vectors live together"),
  makeChunk("doc-b#chunk-0001", "doc-b", "engram pairs with memory layer"),
  makeChunk("doc-c#chunk-0001", "doc-c", "graph walks traverse the index"),
  makeChunk("doc-d#chunk-0001", "doc-d", "lexical ranking and stable citations"),
  makeChunk("doc-e#chunk-0001", "doc-e", "engram and memory and graph share a chunk"),
];

const ENTRIES: VectorIndexEntry[] = CHUNKS.map((c) => ({
  id: c.id,
  vector: hashingEmbedder.embed(c.text),
}));

const GRAPH: GraphIndex = buildGraphIndex(CHUNKS, {
  corpusHash: "hybrid-test",
  dictionary: ["engram", "graph", "memory", "vectors", "lexical"],
});

describe("rrf", () => {
  it("uses the default k=60 constant", () => {
    expect(DEFAULT_RRF_K).toBe(60);
  });

  it("fuses two rankings by descending RRF score with chunk-id tie-break", () => {
    const left: RagSignalScore[] = [
      { chunk_id: "a", rank: 0, score: 0.9 },
      { chunk_id: "b", rank: 1, score: 0.6 },
    ];
    const right: RagSignalScore[] = [
      { chunk_id: "b", rank: 0, score: 0.8 },
      { chunk_id: "c", rank: 1, score: 0.4 },
    ];
    const fused = fuseRankings([left, right]);
    // b appears in both: 1/(60+1) + 1/(60+0) = 1/61 + 1/60 ≈ 0.0329
    // a appears once: 1/(60+0) = 1/60 ≈ 0.0167
    // c appears once: 1/(60+1) = 1/61 ≈ 0.0164
    expect(fused[0]?.chunk_id).toBe("b");
    expect(fused[1]?.chunk_id).toBe("a");
    expect(fused[2]?.chunk_id).toBe("c");
    expect(fused[0]?.rank).toBe(0);
    expect(fused[1]?.rank).toBe(1);
    expect(fused[2]?.rank).toBe(2);
  });

  it("returns an empty array when no rankings are provided", () => {
    expect(fuseRankings([])).toEqual([]);
  });

  it("emits a single ranking's RRF scores when only one signal is present", () => {
    const only: RagSignalScore[] = [
      { chunk_id: "x", rank: 0, score: 0.5 },
      { chunk_id: "y", rank: 1, score: 0.3 },
    ];
    const fused = fuseRankings([only]);
    expect(fused.map((e) => e.chunk_id)).toEqual(["x", "y"]);
  });

  it("ties by chunk_id when RRF scores are equal", () => {
    const left: RagSignalScore[] = [{ chunk_id: "z", rank: 0, score: 0.1 }];
    const right: RagSignalScore[] = [{ chunk_id: "a", rank: 0, score: 0.1 }];
    const fused = fuseRankings([left, right]);
    // Both have 1/(60+0) so we tie-break by chunk_id.
    expect(fused.map((e) => e.chunk_id)).toEqual(["a", "z"]);
  });
});

describe("hybridRetriever", () => {
  it("dispatches mode=lexical to the lexical path and populates signals.lexical", () => {
    const response = retrieveHybrid(
      { text: "stable citations", top_k: 2 },
      CHUNKS,
      { embedder: hashingEmbedder, mode: "lexical" },
    );

    expect(response.results.length).toBeGreaterThan(0);
    for (const result of response.results) {
      expect(result.signals?.lexical).toBeDefined();
      expect(result.signals?.lexical?.[0]?.chunk_id).toBe(result.chunk_id);
    }
  });

  it("dispatches mode=semantic to the cosine top-k path and populates signals.semantic", () => {
    const response = retrieveHybrid(
      { text: "stable citations ranking", top_k: 3 },
      CHUNKS,
      { embedder: hashingEmbedder, mode: "semantic", prebuiltEntries: ENTRIES },
    );

    expect(response.results.length).toBeGreaterThan(0);
    for (const result of response.results) {
      expect(result.signals?.semantic).toBeDefined();
      expect(result.signals?.semantic?.[0]?.chunk_id).toBe(result.chunk_id);
    }
  });

  it("dispatches mode=graph to lexical-seeded 1-hop expansion with signals.graph", () => {
    const response = retrieveHybrid(
      { text: "engram graph", top_k: 2 },
      CHUNKS,
      {
        embedder: hashingEmbedder,
        mode: "graph",
        prebuiltEntries: ENTRIES,
        prebuiltGraph: GRAPH,
      },
    );

    expect(response.results.length).toBeGreaterThan(0);
    for (const result of response.results) {
      expect(result.signals?.graph).toBeDefined();
    }
  });

  it("fuses lexical, semantic, and graph rankings in mode=hybrid with signals.fused", () => {
    const response = retrieveHybrid(
      { text: "engram graph memory", top_k: 3 },
      CHUNKS,
      {
        embedder: hashingEmbedder,
        mode: "hybrid",
        prebuiltEntries: ENTRIES,
        prebuiltGraph: GRAPH,
      },
    );

    expect(response.results.length).toBeGreaterThan(0);
    for (const result of response.results) {
      // Every result must carry a fused signal whose chunk_id matches.
      const fused = result.signals?.fused ?? [];
      const self = fused.find((s) => s.chunk_id === result.chunk_id);
      expect(self).toBeDefined();
      // The top-level score must equal the fused contribution.
      expect(result.score).toBeCloseTo(self?.score ?? -1, 6);
    }
  });

  it("degrades gracefully when one of the three signals is absent (mode=hybrid)", () => {
    // No prebuilt entries -> semantic ranking falls back to lexical and
    // contributes zero for any non-lexical chunk ids; no prebuilt graph
    // -> the graph signal is omitted entirely. Fusion must still proceed.
    const response = retrieveHybrid(
      { text: "engram graph memory", top_k: 2 },
      CHUNKS,
      {
        embedder: hashingEmbedder,
        mode: "hybrid",
        // prebuiltEntries + prebuiltGraph both omitted on purpose
      },
    );

    expect(response.results.length).toBeGreaterThan(0);
    for (const result of response.results) {
      // signals.fused MUST be present on every result, even when the
      // graph signal is absent and the semantic signal falls back.
      expect(result.signals?.fused).toBeDefined();
    }
  });

  it("preserves citation fields and chunk_id on every result across all modes", () => {
    for (const mode of ["lexical", "semantic", "graph", "hybrid"] as const) {
      const response = retrieveHybrid(
        { text: "engram graph", top_k: 2 },
        CHUNKS,
        {
          embedder: hashingEmbedder,
          mode,
          prebuiltEntries: ENTRIES,
          prebuiltGraph: GRAPH,
        },
      );

      for (const result of response.results) {
        expect(result.chunk_id.length).toBeGreaterThan(0);
        expect(result.snippet.length).toBeGreaterThan(0);
        expect(result.citation.document_id.length).toBeGreaterThan(0);
        expect(result.citation.source_path.length).toBeGreaterThan(0);
      }
    }
  });
});
