import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Embedder } from "../../../src/rag/embedder/embedder.js";
import {
  clearEmbedderRegistry,
  isRegistered,
  registerEmbedder,
  resolveEmbedder,
} from "../../../src/rag/embedder/registry.js";

class StubEmbedder implements Embedder {
  readonly id: string;
  readonly dimensions: number;

  constructor(id: string, dimensions: number) {
    this.id = id;
    this.dimensions = dimensions;
  }

  embed(text: string): number[] {
    return new Array<number>(this.dimensions).fill(text.length);
  }
}

describe("embedder registry", () => {
  beforeEach(() => {
    clearEmbedderRegistry();
  });

  afterEach(() => {
    clearEmbedderRegistry();
  });

  it("registers and resolves an embedder by id", () => {
    const embedder = new StubEmbedder("stub-a", 4);
    registerEmbedder(embedder);

    expect(isRegistered("stub-a")).toBe(true);
    expect(resolveEmbedder("stub-a")).toBe(embedder);
  });

  it("rejects duplicate id registration with a structured error", () => {
    registerEmbedder(new StubEmbedder("dup", 3));
    expect(() => registerEmbedder(new StubEmbedder("dup", 3))).toThrow(/dup|already/i);
    // The original implementation must remain active.
    expect(resolveEmbedder("dup").dimensions).toBe(3);
  });

  it("rejects empty id registration", () => {
    expect(() => registerEmbedder(new StubEmbedder("", 3))).toThrow();
  });

  it("rejects an embedder whose embed() returns a length different from declared dimensions", () => {
    class BadEmbedder implements Embedder {
      readonly id = "bad";
      readonly dimensions = 4;
      embed(): number[] {
        return [1, 2, 3]; // length 3 != dimensions 4
      }
    }
    expect(() => registerEmbedder(new BadEmbedder())).toThrow(/dimension/i);
    expect(isRegistered("bad")).toBe(false);
  });

  it("resolving an unknown id fails loudly and never falls back silently", () => {
    expect(() => resolveEmbedder("missing")).toThrow(/missing/);
  });

  it("clearEmbedderRegistry removes every registered embedder", () => {
    registerEmbedder(new StubEmbedder("a", 2));
    registerEmbedder(new StubEmbedder("b", 2));
    clearEmbedderRegistry();
    expect(isRegistered("a")).toBe(false);
    expect(isRegistered("b")).toBe(false);
  });
});
