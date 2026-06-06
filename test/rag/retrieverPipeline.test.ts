import { describe, expect, it } from "vitest";
import { safeParseRagRetrievalResponse } from "../../src/contracts/rag.js";
import { chunkDocuments } from "../../src/rag/chunker.js";
import { loadCorpusDocuments } from "../../src/rag/corpusLoader.js";
import { retrieveChunks } from "../../src/rag/retriever.js";

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
});
