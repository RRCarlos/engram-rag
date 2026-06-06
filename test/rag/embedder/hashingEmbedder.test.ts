import { describe, expect, it } from "vitest";
import {
  createHashingEmbedder,
  hashingEmbedder,
} from "../../../src/rag/embedder/hashingEmbedder.js";

describe("hashingEmbedder", () => {
  it("exposes id 'hashing' and a positive integer dimensions (default 256)", () => {
    expect(hashingEmbedder.id).toBe("hashing");
    expect(Number.isInteger(hashingEmbedder.dimensions)).toBe(true);
    expect(hashingEmbedder.dimensions).toBeGreaterThan(0);
    // Design default for the deterministic hashing embedder is 256.
    expect(hashingEmbedder.dimensions).toBe(256);
  });

  it("is deterministic: same input yields element-wise equal vector", () => {
    const a = hashingEmbedder.embed("stable citations");
    const b = hashingEmbedder.embed("stable citations");
    expect(a).toEqual(b);
  });

  it("returns a vector of length equal to dimensions", () => {
    const v = hashingEmbedder.embed("chunk text");
    expect(v).toHaveLength(hashingEmbedder.dimensions);
  });

  it("is L2-normalized: Euclidean norm equals 1 within tolerance", () => {
    for (const text of ["alpha", "beta gamma", "the quick brown fox", "x"]) {
      const v = hashingEmbedder.embed(text);
      const norm = Math.sqrt(v.reduce((acc, x) => acc + x * x, 0));
      expect(norm).toBeCloseTo(1, 6);
    }
  });

  it("returns a new array on each call (no shared references)", () => {
    const a = hashingEmbedder.embed("hello world");
    const b = hashingEmbedder.embed("hello world");
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it("produces different vectors for distinct inputs", () => {
    const a = hashingEmbedder.embed("alpha retrieval");
    const b = hashingEmbedder.embed("beta retrieval");
    expect(a).not.toEqual(b);
  });

  it("accepts a custom dimensions value via factory and still L2-normalizes", () => {
    const custom = createHashingEmbedder(64);
    expect(custom.dimensions).toBe(64);
    const v = custom.embed("normalized please");
    expect(v).toHaveLength(64);
    const norm = Math.sqrt(v.reduce((acc, x) => acc + x * x, 0));
    expect(norm).toBeCloseTo(1, 6);
  });

  it("a custom-dimensions embedder is deterministic and isolated from the default", () => {
    const a = createHashingEmbedder(64);
    const b = createHashingEmbedder(64);
    expect(a.embed("text")).toEqual(b.embed("text"));
    expect(a.embed("text")).toHaveLength(64);
    expect(hashingEmbedder.embed("text")).toHaveLength(256);
  });

  it("rejects non-positive integer dimensions", () => {
    expect(() => createHashingEmbedder(0)).toThrow();
    expect(() => createHashingEmbedder(-1)).toThrow();
    expect(() => createHashingEmbedder(1.5)).toThrow();
  });
});
