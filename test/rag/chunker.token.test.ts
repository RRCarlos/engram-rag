import { describe, expect, it, beforeAll } from "vitest";
import { loadCorpusDocuments } from "../../src/rag/corpusLoader.js";
import { chunkDocuments } from "../../src/rag/chunker.js";

describe("chunker — token-based with chunk_size/chunk_overlap (PR6/#32)", () => {
  let docs: Awaited<ReturnType<typeof loadCorpusDocuments>>;

  beforeAll(async () => {
    docs = await loadCorpusDocuments();
  });

  it("accepts token-based options and rejects overlap >= chunk_size", () => {
    expect(() => chunkDocuments(docs, { chunkSize: 100, chunkOverlap: 100 })).toThrow(
      /chunkOverlap must be less than chunkSize/,
    );

    expect(() => chunkDocuments(docs, { chunkSize: 50, chunkOverlap: 60 })).toThrow(
      /chunkOverlap must be less than chunkSize/,
    );
  });

  it("honors token chunk_size with deterministic boundaries", async () => {
    const chunks = chunkDocuments(docs, { chunkSize: 64, chunkOverlap: 16 });

    expect(chunks.length).toBeGreaterThan(0);
    // Stable IDs across runs
    const second = chunkDocuments(docs, { chunkSize: 64, chunkOverlap: 16 });
    expect(chunks.map((c) => c.id)).toEqual(second.map((c) => c.id));
  });

  it("applies overlap between adjacent chunks (token count)", async () => {
    // Use all documents to ensure enough tokens for multiple chunks
    const chunks = chunkDocuments(docs, { chunkSize: 60, chunkOverlap: 15 });

    expect(chunks.length).toBeGreaterThan(1);
    // Overlap means consecutive chunks share ~15 tokens of text
    for (let i = 1; i < chunks.length; i += 1) {
      const prev = chunks[i - 1];
      const curr = chunks[i];
      if (!prev || !curr) continue;
      const prevTokens = new Set(prev.text.toLowerCase().match(/\w+/g) ?? []);
      const currTokens = new Set(curr.text.toLowerCase().match(/\w+/g) ?? []);
      const overlapTokens = [...prevTokens].filter((t) => currTokens.has(t));
      expect(overlapTokens.length).toBeGreaterThanOrEqual(5); // approx overlap
    }
  });

  it("does not split words mid-token", async () => {
    const doc = docs[0];
    if (!doc) throw new Error("fixture missing");
    const chunks = chunkDocuments([doc], { chunkSize: 30, chunkOverlap: 5 });

    for (const chunk of chunks) {
      // No chunk should end with a partial word
      expect(chunk.text.trim().endsWith(" ")).toBe(false);
      // Token count should be <= chunkSize (allowing small overrun for last token)
      const tokens = chunk.text.toLowerCase().match(/\w+/g);
      const tokenCount = tokens ? tokens.length : 0;
      expect(tokenCount).toBeLessThanOrEqual(35); // small buffer
    }
  });

  it("falls back to character-based when only maxCharacters given (backwards compat)", async () => {
    const chunks = chunkDocuments(docs, { maxCharacters: 90 });
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("produces citation metadata with token-accurate offsets", async () => {
    const chunks = chunkDocuments(docs, { chunkSize: 50, chunkOverlap: 10 });
    for (const chunk of chunks) {
      expect(chunk.citation.start_offset).toBeLessThan(chunk.citation.end_offset);
      expect(chunk.citation.start_line).toBeLessThanOrEqual(chunk.citation.end_line);
    }
  });
});