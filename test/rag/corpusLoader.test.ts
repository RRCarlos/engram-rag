import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { loadCorpusDocuments, safeLoadCorpusDocuments } from "../../src/rag/corpusLoader.js";

describe("corpusLoader", () => {
  it("loads default corpus documents in deterministic ID order", async () => {
    const documents = await loadCorpusDocuments();

    expect(documents.map((document) => document.id)).toEqual([
      "doc-alpha",
      "doc-beta",
      "doc-gamma",
    ]);
    expect(documents[0]?.source_path).toBe("fixtures/corpus/alpha.json");
  });

  it("loads a custom corpus directory and validates document content", async () => {
    const dir = await mkdtemp(join(tmpdir(), "rag-corpus-"));
    try {
      await writeFile(
        join(dir, "custom.json"),
        JSON.stringify({
          id: "doc-custom",
          title: "Custom Retrieval Fixture",
          source_path: "custom.json",
          text: "Custom retrieval text proves custom directory loading.",
        }),
      );

      const documents = await loadCorpusDocuments(dir);
      expect(documents).toHaveLength(1);
      expect(documents[0]?.title).toBe("Custom Retrieval Fixture");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns a structured failure for invalid fixtures", async () => {
    const dir = await mkdtemp(join(tmpdir(), "rag-corpus-invalid-"));
    try {
      await writeFile(join(dir, "broken.json"), JSON.stringify({ id: "doc-broken" }));

      const result = await safeLoadCorpusDocuments(dir);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/broken\.json/);
        expect(result.error).toMatch(/title|source_path|text/);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
