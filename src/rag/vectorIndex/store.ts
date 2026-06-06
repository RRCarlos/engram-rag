import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type VectorIndexEntry = {
  id: string;
  vector: number[];
};

export type VectorIndexSnapshot = {
  corpusHash: string;
  dimensions: number;
  entries: VectorIndexEntry[];
};

/**
 * File-system path for a cached vector index. The path is anchored at a
 * caller-provided root (defaults to `.rag/`) and namespaced by `corpusHash`
 * so different corpora never collide.
 */
export function vectorIndexPath(root: string, corpusHash: string): string {
  return join(root, "vector", `${corpusHash}.json`);
}

function validate(entries: VectorIndexEntry[]): void {
  if (entries.length === 0) {
    throw new Error("vector index: refusing to persist an empty entry list");
  }
  const expectedLength = entries[0]?.vector.length ?? 0;
  if (expectedLength <= 0) {
    throw new Error("vector index: entry vectors must have a positive length");
  }
  for (const entry of entries) {
    if (!entry.id || entry.id.length === 0) {
      throw new Error("vector index: entry id must be non-empty");
    }
    if (entry.vector.length !== expectedLength) {
      throw new Error(
        `vector index: entry '${entry.id}' has length ${entry.vector.length}, expected ${expectedLength}`,
      );
    }
    for (const value of entry.vector) {
      if (!Number.isFinite(value)) {
        throw new Error(`vector index: entry '${entry.id}' contains a non-finite value`);
      }
    }
  }
}

export async function saveVectorIndex(
  root: string,
  corpusHash: string,
  entries: VectorIndexEntry[],
): Promise<void> {
  validate(entries);
  const path = vectorIndexPath(root, corpusHash);
  await mkdir(join(root, "vector"), { recursive: true });
  const snapshot: VectorIndexSnapshot = {
    corpusHash,
    dimensions: entries[0]?.vector.length ?? 0,
    entries,
  };
  await writeFile(path, JSON.stringify(snapshot, null, 2), "utf8");
}

export async function loadVectorIndex(
  root: string,
  corpusHash: string,
): Promise<VectorIndexEntry[] | null> {
  const path = vectorIndexPath(root, corpusHash);
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
  const parsed: unknown = JSON.parse(raw);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("entries" in parsed) ||
    !Array.isArray((parsed as { entries: unknown }).entries)
  ) {
    throw new Error(`vector index: malformed cache file at ${path}`);
  }
  const entries = (parsed as { entries: VectorIndexEntry[] }).entries;
  validate(entries);
  return entries;
}
