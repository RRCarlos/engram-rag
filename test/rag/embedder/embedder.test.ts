import { describe, expect, it } from "vitest";
import type { Embedder } from "../../../src/rag/embedder/embedder.js";

class StubEmbedder implements Embedder {
  readonly id: string;
  readonly dimensions: number;
  private readonly vectors: Record<string, number[]>;

  constructor(id: string, dimensions: number, vectors: Record<string, number[]>) {
    this.id = id;
    this.dimensions = dimensions;
    this.vectors = vectors;
  }

  embed(text: string): number[] {
    const vector = this.vectors[text];
    if (!vector) {
      throw new Error(`stub: no vector for ${text}`);
    }
    return [...vector];
  }
}

describe("Embedder contract", () => {
  it("exposes a non-empty id and positive integer dimensions", () => {
    const embedder = new StubEmbedder("stub", 4, { hello: [1, 0, 0, 0] });

    expect(embedder.id).toBe("stub");
    expect(embedder.id.length).toBeGreaterThan(0);
    expect(Number.isInteger(embedder.dimensions)).toBe(true);
    expect(embedder.dimensions).toBeGreaterThan(0);
  });

  it("returns a fresh array per embed call (no shared references)", () => {
    const embedder = new StubEmbedder("stub", 3, { hi: [0.1, 0.2, 0.3] });

    const a = embedder.embed("hi");
    const b = embedder.embed("hi");
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it("returns a dense vector of declared length with finite numbers", () => {
    const embedder = new StubEmbedder("stub", 5, { ok: [1, 2, 3, 4, 5] });
    const vector = embedder.embed("ok");
    expect(vector).toHaveLength(5);
    for (const value of vector) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});
