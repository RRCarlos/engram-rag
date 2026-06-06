import { describe, expect, it } from "vitest";
import { cosineSimilarity, cosineTopK } from "../../../src/rag/vectorIndex/cosine.js";

describe("cosine similarity", () => {
  it("returns 1 for identical unit vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 10);
  });

  it("returns 0 for orthogonal unit vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0, 10);
  });

  it("returns -1 for opposing unit vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [-1, 0, 0])).toBeCloseTo(-1, 10);
  });

  it("normalizes raw magnitudes (scale-invariant)", () => {
    expect(cosineSimilarity([2, 0, 0], [5, 0, 0])).toBeCloseTo(1, 10);
    expect(cosineSimilarity([1, 1, 0], [2, 2, 0])).toBeCloseTo(1, 10);
  });

  it("returns 0 for zero vectors without dividing by zero", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([0, 0, 0], [0, 0, 0])).toBe(0);
  });

  it("clamps tiny floating-point drift into the [-1, 1] range", () => {
    const v = [Math.SQRT1_2, Math.SQRT1_2, 0];
    const v2 = [Math.SQRT1_2 * (1 + 1e-12), Math.SQRT1_2, 0];
    const score = cosineSimilarity(v, v2);
    expect(score).toBeLessThanOrEqual(1);
    expect(score).toBeGreaterThanOrEqual(-1);
  });

  it("rejects vectors of different lengths", () => {
    expect(() => cosineSimilarity([1, 0], [1, 0, 0])).toThrow(/length/i);
  });
});

describe("cosineTopK", () => {
  const query = [1, 0, 0];
  const entries = [
    { id: "a", vector: [1, 0, 0] },
    { id: "b", vector: [0, 1, 0] },
    { id: "c", vector: [0.7071, 0.7071, 0] },
    { id: "d", vector: [-1, 0, 0] },
    { id: "e", vector: [0, 0, 1] },
  ];

  it("returns the top-k entries ordered by descending similarity", () => {
    const result = cosineTopK(query, entries, 3);
    expect(result.map((r) => r.id)).toEqual(["a", "c", "b"]);
    expect(result[0]?.score).toBeCloseTo(1, 6);
    expect(result[1]?.score).toBeCloseTo(0.7071, 3);
  });

  it("breaks ties on identical similarity by entry id (lexicographic)", () => {
    const ties = [
      { id: "zeta", vector: [0.6, 0.8, 0] },
      { id: "alpha", vector: [0.6, 0.8, 0] },
      { id: "mu", vector: [0.6, 0.8, 0] },
    ];
    const result = cosineTopK([1, 0, 0], ties, 3);
    expect(result.map((r) => r.id)).toEqual(["alpha", "mu", "zeta"]);
  });

  it("clamps the score to [0, 1] for the consumer-facing API", () => {
    const result = cosineTopK(query, entries, 5);
    for (const r of result) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });

  it("returns an empty list when k <= 0 or no entries", () => {
    expect(cosineTopK(query, entries, 0)).toEqual([]);
    expect(cosineTopK(query, [], 3)).toEqual([]);
  });

  it("returns at most k entries even when more candidates exist", () => {
    const result = cosineTopK(query, entries, 2);
    expect(result).toHaveLength(2);
  });
});
