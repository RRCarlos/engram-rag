import { describe, expect, it } from "vitest";
import {
  DocumentChunkSchema,
  EmbedderIdSchema,
  RagDocumentSchema,
  RagQuerySchema,
  RagRetrievalResponseSchema,
  RagSignalScoreSchema,
  RagSignalsSchema,
  RetrievalModeSchema,
  parseRagQuery,
  safeParseRagDocument,
  safeParseRagRetrievalResponse,
} from "../../src/contracts/rag.js";

const validDocument = {
  id: "doc-alpha",
  title: "Alpha System Notes",
  source_path: "fixtures/corpus/alpha.json",
  text: "Alpha retrieval uses stable citations for every chunk.",
};

const validChunk = {
  id: "doc-alpha#chunk-0001",
  document_id: "doc-alpha",
  title: "Alpha System Notes",
  source_path: "fixtures/corpus/alpha.json",
  chunk_index: 0,
  text: "Alpha retrieval uses stable citations for every chunk.",
  citation: {
    document_id: "doc-alpha",
    title: "Alpha System Notes",
    source_path: "fixtures/corpus/alpha.json",
    start_offset: 0,
    end_offset: 55,
    start_line: 1,
    end_line: 1,
  },
};

describe("rag contracts", () => {
  it("accepts a valid retrieval query and preserves text plus top-k", () => {
    const query = parseRagQuery({ text: "stable citations", top_k: 2 });
    expect(query).toEqual({ text: "stable citations", top_k: 2 });
  });

  it("rejects invalid retrieval queries with structured errors", () => {
    const emptyText = RagQuerySchema.safeParse({ text: "", top_k: 2 });
    const nonPositiveTopK = RagQuerySchema.safeParse({ text: "citations", top_k: 0 });

    expect(emptyText.success).toBe(false);
    expect(nonPositiveTopK.success).toBe(false);
  });

  it("accepts strict RAG documents and rejects extra properties", () => {
    expect(RagDocumentSchema.parse(validDocument).id).toBe("doc-alpha");

    const result = safeParseRagDocument({ ...validDocument, extra: "not allowed" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/extra|Unrecognized key/);
    }
  });

  it("accepts chunks with citation location metadata", () => {
    const chunk = DocumentChunkSchema.parse(validChunk);

    expect(chunk.id).toBe("doc-alpha#chunk-0001");
    expect(chunk.citation).toMatchObject({
      document_id: "doc-alpha",
      source_path: "fixtures/corpus/alpha.json",
      start_offset: 0,
      end_offset: 55,
    });
  });

  it("validates citation-ready retrieval responses without generated answer fields", () => {
    const response = RagRetrievalResponseSchema.parse({
      query: "stable citations",
      top_k: 1,
      results: [
        {
          chunk_id: validChunk.id,
          score: 2,
          snippet: "Alpha retrieval uses stable citations for every chunk.",
          citation: validChunk.citation,
        },
      ],
    });

    expect(response.results[0]?.citation.document_id).toBe("doc-alpha");
    expect("answer" in response).toBe(false);
  });

  it("safe response parsing reports structured failure and emits no result value", () => {
    const result = safeParseRagRetrievalResponse({
      query: "stable citations",
      top_k: 1,
      results: [{ chunk_id: "missing-fields" }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/score|snippet|citation/);
    }
  });
});

describe("rag contracts - new schemas", () => {
  it("EmbedderIdSchema accepts the hashing literal", () => {
    expect(EmbedderIdSchema.parse("hashing")).toBe("hashing");
  });

  it("EmbedderIdSchema accepts any non-empty custom id", () => {
    expect(EmbedderIdSchema.parse("custom-embedder-v1")).toBe("custom-embedder-v1");
  });

  it("EmbedderIdSchema rejects empty id", () => {
    expect(EmbedderIdSchema.safeParse("").success).toBe(false);
  });

  it("RetrievalModeSchema accepts the four supported modes", () => {
    for (const mode of ["lexical", "semantic", "graph", "hybrid"] as const) {
      expect(RetrievalModeSchema.parse(mode)).toBe(mode);
    }
  });

  it("RetrievalModeSchema rejects unknown modes", () => {
    expect(RetrievalModeSchema.safeParse("nonsense").success).toBe(false);
  });

  it("RagSignalScoreSchema validates chunk_id, rank, score and rejects extras", () => {
    const valid = RagSignalScoreSchema.parse({
      chunk_id: "doc-alpha#chunk-0001",
      rank: 0,
      score: 1.5,
    });
    expect(valid.rank).toBe(0);

    const strict = RagSignalScoreSchema.safeParse({
      chunk_id: "x",
      rank: 0,
      score: 1,
      extra: "no",
    });
    expect(strict.success).toBe(false);
  });

  it("RagSignalsSchema accepts all four optional sub-arrays", () => {
    const payload = {
      lexical: [{ chunk_id: "a", rank: 0, score: 1 }],
      semantic: [{ chunk_id: "a", rank: 0, score: 0.9 }],
      graph: [{ chunk_id: "a", rank: 0, score: 0.5 }],
      fused: [{ chunk_id: "a", rank: 0, score: 0.85 }],
    };
    const parsed = RagSignalsSchema.parse(payload);
    expect(parsed.lexical?.[0]?.chunk_id).toBe("a");
  });

  it("RagSignalsSchema accepts an empty object (all signals optional)", () => {
    expect(RagSignalsSchema.parse({}).lexical).toBeUndefined();
  });

  it("RagRetrievalResponseSchema accepts an optional signals block on results", () => {
    const response = RagRetrievalResponseSchema.parse({
      query: "stable citations",
      top_k: 1,
      results: [
        {
          chunk_id: validChunk.id,
          score: 1,
          snippet: "Alpha retrieval uses stable citations for every chunk.",
          citation: validChunk.citation,
          signals: {
            semantic: [{ chunk_id: validChunk.id, rank: 0, score: 0.9 }],
          },
        },
      ],
    });
    expect(response.results[0]?.signals?.semantic?.[0]?.score).toBe(0.9);
  });

  it("RagRetrievalResponseSchema still accepts results without a signals block (backward compat)", () => {
    const response = RagRetrievalResponseSchema.parse({
      query: "stable citations",
      top_k: 1,
      results: [
        {
          chunk_id: validChunk.id,
          score: 1,
          snippet: "Alpha retrieval uses stable citations for every chunk.",
          citation: validChunk.citation,
        },
      ],
    });
    expect(response.results[0]?.signals).toBeUndefined();
  });
});
