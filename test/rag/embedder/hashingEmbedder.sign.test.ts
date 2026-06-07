import { describe, expect, it } from "vitest";
import { createHashingEmbedder, hashingEmbedder } from "../../../src/rag/embedder/hashingEmbedder.js";

describe("hashingEmbedder — sign parity & dimension handling (PR6/#32)", () => {
  it("uses valid sign parity (not always positive)", () => {
    const emb = createHashingEmbedder(64);
    const vec = emb.embed("deterministic tokens produce mixed signs");
    const hasPositive = vec.some((v) => v > 0);
    const hasNegative = vec.some((v) => v < 0);
    // With multiple tokens, we should see both signs
    expect(hasPositive).toBe(true);
    expect(hasNegative).toBe(true);
  });

  it("produces identical sign pattern across separate embeddings", () => {
    const emb = createHashingEmbedder(64);
    const v1 = emb.embed("stable sign parity test");
    const v2 = emb.embed("stable sign parity test");
    // Every dimension must match exactly
    expect(v1).toEqual(v2);
  });

  it("works with non-power-of-2 dimensions (modulo indexing, not bitmask)", () => {
    const emb = createHashingEmbedder(100); // not power of 2
    const vec = emb.embed("non power of two dimensions");
    expect(vec.length).toBe(100);
    // Should not crash and should produce valid vector
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it("default embedder has 256 dimensions and is L2-normalized", () => {
    expect(hashingEmbedder.dimensions).toBe(256);
    const vec = hashingEmbedder.embed("default embedder test");
    expect(vec.length).toBe(256);
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it("returns zero vector for empty input", () => {
    const emb = createHashingEmbedder(32);
    const vec = emb.embed("");
    expect(vec.every((v) => v === 0)).toBe(true);
  });

  it("throws on invalid dimensions", () => {
    expect(() => createHashingEmbedder(0)).toThrow(/positive integer/);
    expect(() => createHashingEmbedder(-1)).toThrow(/positive integer/);
    expect(() => createHashingEmbedder(3.14)).toThrow(/positive integer/);
  });
});