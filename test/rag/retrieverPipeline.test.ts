import { describe, expect, it } from "vitest";
import { safeParseRagRetrievalResponse } from "../../src/contracts/rag.js";
import { chunkDocuments } from "../../src/rag/chunker.js";
import { loadCorpusDocuments } from "../../src/rag/corpusLoader.js";
import { computeCorpusHash } from "../../src/rag/semanticRetriever.js";
import { retrieveChunks } from "../../src/rag/retriever.js";
import { buildGraphIndex } from "../../src/rag/graphIndex/store.js";
import { hashingEmbedder } from "../../src/rag/embedder/hashingEmbedder.js";
import { retrieveHybrid } from "../../src/rag/hybridRetriever.js";
import { type VectorIndexEntry } from "../../src/rag/vectorIndex/store.js";

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

describe("RAG retrieval pipeline", () => {
  it("loads fixtures, chunks documents, and returns validated citation-ready JSON", async () => {
    const documents = await loadCorpusDocuments();
    const chunks = chunkDocuments(documents, { maxCharacters: 220 });

    const response = retrieveChunks({ text: "stable citations", top_k: 2 }, chunks);
    const parsed = safeParseRagRetrievalResponse(response);

    expect(parsed.ok).toBe(true);
    expect(response.results).toHaveLength(2);
    expect(response.results[0]?.chunk_id).toBe("doc-alpha#chunk-0001");
    expect(response.results[0]?.score).toBeGreaterThan(response.results[1]?.score ?? 0);
    expect(response.results[0]?.citation).toMatchObject({
      document_id: "doc-alpha",
      source_path: "fixtures/corpus/alpha.json",
    });
    expect("prompt" in response).toBe(false);
    expect("stream" in response).toBe(false);
    expect("answer" in response).toBe(false);
  });

  it("fuses lexical, semantic, and graph rankings in mode=hybrid and surfaces signals.fused", async () => {
    const documents = await loadCorpusDocuments();
    const chunks = chunkDocuments(documents, { maxCharacters: 220 });
    const corpusHash = computeCorpusHash(chunks);

    const entries: VectorIndexEntry[] = chunks.map((c) => ({
      id: c.id,
      vector: hashingEmbedder.embed(c.text),
    }));
    const graph = buildGraphIndex(chunks, {
      corpusHash,
      dictionary: RAG_GRAPH_DICTIONARY,
    });

    const response = retrieveHybrid(
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

    const parsed = safeParseRagRetrievalResponse(response);
    expect(parsed.ok).toBe(true);
    expect(response.results.length).toBeGreaterThan(0);

    for (const result of response.results) {
      // Citation fields MUST be preserved on every result.
      expect(result.citation.document_id.length).toBeGreaterThan(0);
      expect(result.citation.source_path.length).toBeGreaterThan(0);
      expect(result.citation.start_offset).toBeGreaterThanOrEqual(0);
      expect(result.citation.end_offset).toBeGreaterThan(result.citation.start_offset);
      // signals.fused MUST be present and the top-level score MUST equal
      // the fused RRF score (per spec scenario "Fuse three signals with RRF").
      const fused = result.signals?.fused ?? [];
      const self = fused.find((s) => s.chunk_id === result.chunk_id);
      expect(self).toBeDefined();
      expect(result.score).toBeCloseTo(self?.score ?? -1, 6);
    }
  });
});

