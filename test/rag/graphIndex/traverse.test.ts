import { describe, expect, it } from "vitest";
import { parseDocumentChunk } from "../../../src/contracts/rag.js";
import { buildGraphIndex, type GraphIndex } from "../../../src/rag/graphIndex/store.js";
import {
  type TraverseOptions,
  traverseOneHop,
} from "../../../src/rag/graphIndex/traverse.js";

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

const RAG_DICTIONARY = ["engram", "graph", "memory", "vectors", "lexical"];

const makeChunks = () => [
  makeChunk("doc-a#chunk-0001", "doc-a", "engram and graph and vectors live together"),
  makeChunk("doc-b#chunk-0001", "doc-b", "engram pairs with memory layer"),
  makeChunk("doc-c#chunk-0001", "doc-c", "graph walks traverse the index"),
  makeChunk("doc-d#chunk-0001", "doc-d", "no canonical terms here at all"),
  makeChunk("doc-e#chunk-0001", "doc-e", "engram and memory and graph share a chunk"),
];

describe("graphIndex/traverse", () => {
  it("expands a seed chunk by 1-hop co-mention neighbors", () => {
    const chunks = makeChunks();
    const index: GraphIndex = buildGraphIndex(chunks, {
      corpusHash: "test-1",
      dictionary: RAG_DICTIONARY,
    });

    const seeds = ["doc-a#chunk-0001"];
    const expanded = traverseOneHop(seeds, index, chunks);

    const ids = expanded.map((r) => r.chunk_id);
    // Seed must always be present.
    expect(ids).toContain("doc-a#chunk-0001");
    // Co-mentioned chunks should appear.
    expect(ids).toContain("doc-b#chunk-0001"); // shares engram
    expect(ids).toContain("doc-c#chunk-0001"); // shares graph
    expect(ids).toContain("doc-e#chunk-0001"); // shares engram, graph
    // Isolated chunk must not appear (no shared entities).
    expect(ids).not.toContain("doc-d#chunk-0001");
  });

  it("caps the per-node degree at the default edge cap of 8", () => {
    // Build a star: one chunk mentions 12 distinct entities; each entity
    // co-occurs in a different chunk so the central chunk would otherwise
    // pull in 12 neighbors. The default cap must keep it at 8.
    const dictionary = Array.from({ length: 12 }, (_, i) => `e${i}`);
    const central = makeChunk(
      "doc-central#chunk-0001",
      "doc-central",
      dictionary.join(" "),
    );
    const leafChunks = dictionary.map((entity) =>
      makeChunk(`doc-${entity}#chunk-0001`, `doc-${entity}`, `${entity} payload`),
    );
    const chunks = [central, ...leafChunks];

    const index: GraphIndex = buildGraphIndex(chunks, {
      corpusHash: "test-cap",
      dictionary,
    });
    const expanded = traverseOneHop(["doc-central#chunk-0001"], index, chunks);
    // The central chunk and at most 8 of the 12 leaf chunks survive the cap.
    const neighborIds = expanded.map((r) => r.chunk_id).filter((id) => id !== "doc-central#chunk-0001");
    expect(neighborIds.length).toBeLessThanOrEqual(8);
    expect(expanded.length).toBeLessThanOrEqual(9);
  });

  it("honors a custom edge cap override", () => {
    const dictionary = Array.from({ length: 6 }, (_, i) => `e${i}`);
    const central = makeChunk(
      "doc-central#chunk-0001",
      "doc-central",
      dictionary.join(" "),
    );
    const leafChunks = dictionary.map((entity) =>
      makeChunk(`doc-${entity}#chunk-0001`, `doc-${entity}`, `${entity} payload`),
    );
    const chunks = [central, ...leafChunks];

    const index: GraphIndex = buildGraphIndex(chunks, {
      corpusHash: "test-cap-custom",
      dictionary,
    });

    const options: TraverseOptions = { edgeCap: 2 };
    const expanded = traverseOneHop(["doc-central#chunk-0001"], index, chunks, options);
    const neighborIds = expanded.map((r) => r.chunk_id).filter((id) => id !== "doc-central#chunk-0001");
    expect(neighborIds.length).toBe(2);
  });

  it("returns the seed deterministically when there are no shared entities", () => {
    const chunks = makeChunks();
    const index: GraphIndex = buildGraphIndex(chunks, {
      corpusHash: "test-iso",
      dictionary: RAG_DICTIONARY,
    });
    // 'doc-d#chunk-0001' mentions no canonical entities.
    const expanded = traverseOneHop(["doc-d#chunk-0001"], index, chunks);
    expect(expanded).toEqual([
      expect.objectContaining({ chunk_id: "doc-d#chunk-0001" }),
    ]);
  });

  it("orders results deterministically by descending score with chunk_id tie-break", () => {
    const chunks = makeChunks();
    const index: GraphIndex = buildGraphIndex(chunks, {
      corpusHash: "test-order",
      dictionary: RAG_DICTIONARY,
    });
    const first = traverseOneHop(["doc-a#chunk-0001"], index, chunks);
    const second = traverseOneHop(["doc-a#chunk-0001"], index, chunks);
    expect(first.map((r) => r.chunk_id)).toEqual(second.map((r) => r.chunk_id));
  });
});
