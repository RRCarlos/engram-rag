import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type VectorIndexEntry,
  loadVectorIndex,
  saveVectorIndex,
  vectorIndexPath,
} from "../../../src/rag/vectorIndex/store.js";

describe("vector index store", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "rag-vector-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("derives a stable file path from the corpus hash", () => {
    const path = vectorIndexPath(tempDir, "abc123");
    expect(path).toBe(join(tempDir, "vector", "abc123.json"));
  });

  it("round-trips entries through JSON", async () => {
    const entries: VectorIndexEntry[] = [
      { id: "doc-a#chunk-0001", vector: [0.1, 0.2, 0.3] },
      { id: "doc-b#chunk-0001", vector: [0.4, 0.5, 0.6] },
    ];
    const path = vectorIndexPath(tempDir, "hash-a");

    await saveVectorIndex(tempDir, "hash-a", entries);
    const loaded = await loadVectorIndex(tempDir, "hash-a");

    expect(loaded).toEqual(entries);

    // Verify the file on disk contains valid JSON.
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as { entries: VectorIndexEntry[] };
    expect(parsed.entries).toEqual(entries);
  });

  it("returns null when the cache file does not exist", async () => {
    const loaded = await loadVectorIndex(tempDir, "missing");
    expect(loaded).toBeNull();
  });

  it("rejects an empty entry list (saves must be non-empty)", async () => {
    await expect(saveVectorIndex(tempDir, "hash-empty", [])).rejects.toThrow(/empty/i);
  });

  it("rejects an entry whose vector contains non-finite values", async () => {
    const entries: VectorIndexEntry[] = [
      { id: "x", vector: [0.1, Number.NaN, 0.3] },
    ];
    await expect(saveVectorIndex(tempDir, "hash-bad", entries)).rejects.toThrow(/finite/i);
  });

  it("rejects mismatched vector lengths inside the entry list", async () => {
    const entries: VectorIndexEntry[] = [
      { id: "a", vector: [0.1, 0.2, 0.3] },
      { id: "b", vector: [0.4, 0.5] },
    ];
    await expect(saveVectorIndex(tempDir, "hash-mismatch", entries)).rejects.toThrow(/length/i);
  });

  it("saves the parent vector directory if it is missing", async () => {
    const entries: VectorIndexEntry[] = [{ id: "a", vector: [0.1, 0.2] }];
    await saveVectorIndex(tempDir, "hash-create", entries);
    const path = vectorIndexPath(tempDir, "hash-create");
    const raw = await readFile(path, "utf8");
    expect(raw.length).toBeGreaterThan(0);
  });
});
