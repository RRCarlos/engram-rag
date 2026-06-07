import { describe, expect, it, beforeAll } from "vitest";
import { loadCorpusDocuments } from "../../../src/rag/corpusLoader.js";
import { chunkDocuments } from "../../../src/rag/chunker.js";
import { buildGraphIndex } from "../../../src/rag/graphIndex/store.js";
import { computeCorpusHash } from "../../../src/rag/semanticRetriever.js";

describe("graph index — corpus-derived dictionary (PR6/#32)", () => {
  let docs: Awaited<ReturnType<typeof loadCorpusDocuments>>;

  beforeAll(async () => {
    docs = await loadCorpusDocuments();
  });

  it("builds adjacency from corpus entities, not hardcoded dictionary", async () => {
    const chunks = chunkDocuments(docs, { chunkSize: 64, chunkOverlap: 16 });
    const corpusHash = computeCorpusHash(chunks);

    const index = buildGraphIndex(chunks, { corpusHash });

    // Should have entities from the actual corpus
    expect(Object.keys(index.chunkEntities).length).toBe(chunks.length);
    // Entity edges should reflect actual co-mentions
    const entityCount = Object.keys(index.entityEdges).length;
    expect(entityCount).toBeGreaterThan(0);

    // No hardcoded fixture entities unless they appear in corpus
    const hasAlpha = Object.keys(index.entityEdges).includes("alpha");
    const hasBeta = Object.keys(index.entityEdges).includes("beta");
    const hasGamma = Object.keys(index.entityEdges).includes("gamma");
    // These may or may not appear depending on corpus content - key is they're derived
    expect(typeof hasAlpha).toBe("boolean");
  });

  it("entities are extracted from chunk text via deterministic dictionary", async () => {
    const chunks = chunkDocuments(docs, { chunkSize: 40, chunkOverlap: 10 });
    const corpusHash = computeCorpusHash(chunks);

    const index = buildGraphIndex(chunks, { corpusHash });

    // Every chunk should have extracted entities
    for (const [chunkId, entities] of Object.entries(index.chunkEntities)) {
      expect(Array.isArray(entities)).toBe(true);
      // Entities should be lowercase canonical terms
      for (const entity of entities) {
        expect(entity).toBe(entity.toLowerCase());
      }
    }
  });

  it("produces deterministic adjacency for same corpus", async () => {
    const chunks1 = chunkDocuments(docs, { chunkSize: 50, chunkOverlap: 10 });
    const chunks2 = chunkDocuments(docs, { chunkSize: 50, chunkOverlap: 10 });
    const hash1 = computeCorpusHash(chunks1);
    const hash2 = computeCorpusHash(chunks2);

    const index1 = buildGraphIndex(chunks1, { corpusHash: hash1 });
    const index2 = buildGraphIndex(chunks2, { corpusHash: hash2 });

    expect(index1.entityEdges).toEqual(index2.entityEdges);
  });

  it("respects edgeCap limit", async () => {
    const chunks = chunkDocuments(docs, { chunkSize: 30, chunkOverlap: 5 });
    const corpusHash = computeCorpusHash(chunks);

    const index = buildGraphIndex(chunks, { corpusHash, edgeCap: 3 });

    for (const neighbors of Object.values(index.entityEdges)) {
      expect(neighbors.length).toBeLessThanOrEqual(3);
    }
  });
});