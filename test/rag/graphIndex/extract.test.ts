import { describe, expect, it } from "vitest";
import { extractEntities } from "../../../src/rag/graphIndex/extract.js";

describe("graphIndex/extract", () => {
  it("returns a sorted, deduplicated, lowercased list of canonical entities", () => {
    const text =
      "Engram pairs with engram and engram again. Graph and graph share a chunk. " +
      "Memory and memory co-occur. Lexical is lowercase already.";
    const dictionary = ["engram", "graph", "memory", "lexical"];

    const result = extractEntities(text, { dictionary });

    // Sorted and deduplicated.
    const sorted = [...result].sort((a, b) => a.localeCompare(b));
    expect(result).toEqual(sorted);
    expect(new Set(result).size).toBe(result.length);

    // Lowercased.
    for (const term of result) {
      expect(term).toBe(term.toLowerCase());
    }

    // Every match must be in the dictionary.
    for (const term of result) {
      expect(dictionary).toContain(term);
    }

    // Deterministic: repeated calls return the same array.
    expect(extractEntities(text, { dictionary })).toEqual(result);
  });

  it("returns an empty array when the text mentions no canonical entities", () => {
    const result = extractEntities("zzz qqq xxx nothing here matches", {
      dictionary: ["alpha", "beta"],
    });
    expect(result).toEqual([]);
  });

  it("honors a custom dictionary and never matches a longer term that is not in the dict", () => {
    const text = "Graph traversal and graph walk should both surface the 'graph' canonical entry exactly once";
    const dictionary = ["graph", "graph traversal", "graph walk"];

    const result = extractEntities(text, { dictionary });

    // Deduplicated.
    expect(new Set(result).size).toBe(result.length);

    // Every match is in the dictionary.
    for (const term of result) {
      expect(dictionary).toContain(term);
    }

    // Sorted, lowercased, deterministic.
    const sorted = [...result].sort((a, b) => a.localeCompare(b));
    expect(result).toEqual(sorted);
    expect(extractEntities(text, { dictionary })).toEqual(result);
  });

  it("uses whole-word boundaries and never returns a partial match", () => {
    // 'rag' must not match 'raging' or 'dragnet'; 'graph' must not match 'graphite'.
    const text = "raging dragnet and graphite are not the canonical entries here";
    const dictionary = ["rag", "graph", "canonical"];

    const result = extractEntities(text, { dictionary });

    // No substring contamination: 'rag' is not a whole word in the input,
    // so it must not be surfaced even though 'raging' contains it.
    expect(result).not.toContain("rag");
    expect(result).not.toContain("graph");
    // 'canonical' IS a whole word in the input, so it must be surfaced.
    expect(result).toContain("canonical");
  });

  it("returns identical output for two distinct empty inputs", () => {
    expect(extractEntities("")).toEqual(extractEntities(""));
    expect(extractEntities("")).toEqual([]);
    expect(extractEntities("", { dictionary: ["anything"] })).toEqual([]);
  });
});
