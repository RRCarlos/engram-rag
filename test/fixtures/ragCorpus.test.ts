import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRagDocument } from "../../src/contracts/rag.js";

const corpusDir = join(process.cwd(), "fixtures", "corpus");

describe("rag corpus fixtures", () => {
  it.each(["alpha.json", "beta.json", "gamma.json"])(
    "validates %s with source identity, title, path, and text",
    async (filename) => {
      const raw = await readFile(join(corpusDir, filename), "utf8");
      const document = parseRagDocument(JSON.parse(raw));

      expect(document.id).toMatch(/^doc-/);
      expect(document.title.length).toBeGreaterThan(3);
      expect(document.source_path).toBe(`fixtures/corpus/${filename}`);
      expect(document.text).toContain("retrieval");
    },
  );
});
