import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseDocumentChunk } from "../../../src/contracts/rag.js";
import {
  type GraphIndex,
  buildGraphIndex,
  graphIndexPath,
  loadGraphIndex,
  saveGraphIndex,
} from "../../../src/rag/graphIndex/store.js";

const makeChunk = (id: string, documentId: string, text: string) =>
  parseDocumentChunk({
    id,
    document_id: documentId,
    title: documentId,
    source_path: `fixtures/corpus/${documentId}.json`,
    chunk_index: 0,
    text,
    citation: {
      document_id: documentId,
      title: documentId,
      source_path: `fixtures/corpus/${documentId}.json`,
      start_offset: 0,
      end_offset: text.length,
      start_line: 1,
      end_line: 1,
    },
  });

describe("graphIndex/store", () => {
  let workdir: string;

  beforeEach(async () => {
    workdir = await mkdtemp(join(tmpdir(), "graph-store-"));
  });

  afterEach(async () => {
    await rm(workdir, { recursive: true, force: true });
  });

  it("builds an undirected adjacency list with sorted, lowercased entities", () => {
    const chunks = [
      makeChunk("a#1", "a", "engram and graph"),
      makeChunk("b#1", "b", "engram and memory"),
      makeChunk("c#1", "c", "graph and memory"),
    ];

    const index = buildGraphIndex(chunks, {
      corpusHash: "hash-1",
      dictionary: ["engram", "graph", "memory"],
    });

    expect(index.corpusHash).toBe("hash-1");
    expect(index.edgeCap).toBe(8);

    // chunkEntities are sorted and lowercased.
    expect(index.chunkEntities["a#1"]).toEqual(["engram", "graph"]);
    expect(index.chunkEntities["b#1"]).toEqual(["engram", "memory"]);
    expect(index.chunkEntities["c#1"]).toEqual(["graph", "memory"]);

    // entityChunks are sorted by chunk id.
    expect(index.entityChunks["engram"]).toEqual(["a#1", "b#1"]);
    expect(index.entityChunks["graph"]).toEqual(["a#1", "c#1"]);
    expect(index.entityChunks["memory"]).toEqual(["b#1", "c#1"]);

    // entityEdges are sorted and capped.
    expect(index.entityEdges["engram"]).toEqual(["graph", "memory"]);
    expect(index.entityEdges["graph"]).toEqual(["engram", "memory"]);
    expect(index.entityEdges["memory"]).toEqual(["engram", "graph"]);
  });

  it("graphIndexPath joins the cache root and corpus hash under .rag/graph", () => {
    expect(graphIndexPath(".rag", "abc123")).toBe(
      join(".rag", "graph", "abc123.json"),
    );
  });

  it("round-trips a snapshot through the JSON cache and preserves shape", async () => {
    const chunks = [
      makeChunk("alpha#1", "alpha", "engram and graph share a chunk"),
      makeChunk("beta#1", "beta", "engram pairs with memory"),
    ];
    const snapshot: GraphIndex = buildGraphIndex(chunks, {
      corpusHash: "roundtrip",
      dictionary: ["engram", "graph", "memory"],
    });

    await saveGraphIndex(workdir, "roundtrip", snapshot);
    const loaded = await loadGraphIndex(workdir, "roundtrip");

    expect(loaded).not.toBeNull();
    expect(loaded).toEqual(snapshot);
  });

  it("loadGraphIndex returns null when the cache file is missing", async () => {
    const loaded = await loadGraphIndex(workdir, "absent");
    expect(loaded).toBeNull();
  });

  it("rejects an edge cap that is not a positive integer", () => {
    const chunks = [makeChunk("a#1", "a", "engram")];
    expect(() => buildGraphIndex(chunks, { corpusHash: "x", edgeCap: 0 })).toThrow(/edgeCap/i);
    expect(() => buildGraphIndex(chunks, { corpusHash: "x", edgeCap: -1 })).toThrow(/edgeCap/i);
    expect(() => buildGraphIndex(chunks, { corpusHash: "x", edgeCap: 1.5 })).toThrow(/edgeCap/i);
  });

  it("saveGraphIndex refuses a snapshot whose corpusHash does not match the path", async () => {
    const chunks = [makeChunk("a#1", "a", "engram")];
    const snapshot = buildGraphIndex(chunks, {
      corpusHash: "alpha",
      dictionary: ["engram"],
    });
    await expect(saveGraphIndex(workdir, "beta", snapshot)).rejects.toThrow(/corpusHash/i);
  });
});
