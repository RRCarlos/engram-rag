/**
 * Deterministic canonical-term entity extraction for the co-mention graph.
 *
 * The extractor scans a text for whole-word matches against a sorted,
 * lowercased dictionary of canonical entities. Longer matches win ties, and
 * the result is sorted, deduplicated, and lowercased. The algorithm has no
 * network access and is fully deterministic, which matches the design's
 * "canonical-term regex dictionary" choice.
 */

export type ExtractOptions = {
  /**
   * Optional custom dictionary. Each entry must be a non-empty lowercased
   * canonical term. When omitted, a small built-in technical vocabulary is
   * used.
   */
  dictionary?: readonly string[];
};

const DEFAULT_DICTIONARY: readonly string[] = [
  "engram",
  "graph",
  "lexical",
  "memory",
  "rag",
  "semantic",
  "vectors",
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractEntities(
  text: string,
  options: ExtractOptions = {},
): string[] {
  if (text.length === 0) {
    return [];
  }
  const raw = options.dictionary ?? DEFAULT_DICTIONARY;
  // Sanitize + sort the dictionary by descending length so longer
  // canonical terms win when they overlap with shorter substrings.
  const dictionary = Array.from(
    new Set(
      raw
        .map((term) => term.toLowerCase())
        .filter((term) => term.length > 0),
    ),
  ).sort((left, right) => {
    if (left.length !== right.length) {
      return right.length - left.length;
    }
    return left.localeCompare(right);
  });

  if (dictionary.length === 0) {
    return [];
  }

  const haystack = text.toLowerCase();
  const found = new Set<string>();
  for (const term of dictionary) {
    // Whole-word boundary check: a word character on either side disqualifies
    // the match. `\\b` already respects Unicode lowercase letters because
    // we lowercased the haystack.
    const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, "g");
    if (pattern.test(haystack)) {
      found.add(term);
    }
  }

  return Array.from(found).sort((left, right) => left.localeCompare(right));
}
