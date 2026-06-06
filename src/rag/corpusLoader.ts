import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ParseResult } from "../contracts/knowledgeRecord.js";
import { type RagDocument, safeParseRagDocument } from "../contracts/rag.js";

const DEFAULT_CORPUS_DIR = join(process.cwd(), "fixtures", "corpus");

export async function loadCorpusDocuments(
  corpusDir = DEFAULT_CORPUS_DIR,
): Promise<RagDocument[]> {
  const filenames = (await readdir(corpusDir))
    .filter((filename) => filename.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));

  const documents = await Promise.all(
    filenames.map(async (filename) => {
      const raw = await readFile(join(corpusDir, filename), "utf8");
      const parsed: unknown = JSON.parse(raw);
      const result = safeParseRagDocument(parsed);
      if (!result.ok) {
        throw new Error(`${filename}: ${result.error}`);
      }
      return result.value;
    }),
  );

  return documents.sort((a, b) => a.id.localeCompare(b.id));
}

export async function safeLoadCorpusDocuments(
  corpusDir = DEFAULT_CORPUS_DIR,
): Promise<ParseResult<RagDocument[]>> {
  try {
    return { ok: true, value: await loadCorpusDocuments(corpusDir) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
