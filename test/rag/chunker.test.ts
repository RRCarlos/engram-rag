import { describe, expect, it } from "vitest";
import { loadCorpusDocuments } from "../../src/rag/corpusLoader.js";
import { chunkDocuments } from "../../src/rag/chunker.js";

describe("chunker", () => {
  it("produces stable chunk IDs, order, text, and metadata across repeated runs", async () => {
    const documents = await loadCorpusDocuments();
    const first = chunkDocuments(documents, { maxCharacters: 90 });
    const second = chunkDocuments(documents, { maxCharacters: 90 });

    expect(first).toEqual(second);
    expect(first.map((chunk) => chunk.id)).toEqual([
      "doc-alpha#chunk-0001",
      "doc-alpha#chunk-0002",
      "doc-beta#chunk-0001",
      "doc-beta#chunk-0002",
      "doc-gamma#chunk-0001",
      "doc-gamma#chunk-0002",
    ]);
    expect(first[0]?.document_id).toBe("doc-alpha");
    expect(first[0]?.chunk_index).toBe(0);
  });

  it("preserves source metadata and citation locations on every chunk", async () => {
    const chunks = chunkDocuments(await loadCorpusDocuments(), { maxCharacters: 90 });

    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.title.length).toBeGreaterThan(3);
      expect(chunk.source_path).toMatch(/^fixtures\/corpus\//);
      expect(chunk.citation.document_id).toBe(chunk.document_id);
      expect(chunk.citation.title).toBe(chunk.title);
      expect(chunk.citation.source_path).toBe(chunk.source_path);
      expect(chunk.citation.end_offset).toBeGreaterThan(chunk.citation.start_offset);
      expect(chunk.citation.end_line).toBeGreaterThanOrEqual(chunk.citation.start_line);
    }
  });

  it("honors option-driven chunk sizing without splitting words", async () => {
    const [document] = await loadCorpusDocuments();
    if (!document) {
      throw new Error("expected fixture document");
    }

    const chunks = chunkDocuments([document], { maxCharacters: 55 });

    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((chunk) => chunk.text.length <= 55)).toBe(true);
    expect(chunks[0]?.text.endsWith(" ")).toBe(false);
  });
});
