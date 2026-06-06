export type CosineEntry = {
  id: string;
  vector: number[];
};

export type CosineResult = {
  id: string;
  score: number;
};

/**
 * Cosine similarity between two equal-length numeric vectors.
 *
 * Returns 0 for any zero vector to avoid `NaN` propagation. The result is
 * clamped into `[-1, 1]` to absorb tiny floating-point drift.
 */
export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== right.length) {
    throw new Error(
      `cosineSimilarity: vector length mismatch (${left.length} vs ${right.length})`,
    );
  }
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i] ?? 0;
    const b = right[i] ?? 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }
  const raw = dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
  if (raw > 1) return 1;
  if (raw < -1) return -1;
  return raw;
}

/**
 * Cosine top-k over a list of `{ id, vector }` entries.
 *
 * The score is clamped to `[0, 1]` because the consumer-facing semantic
 * retriever is allowed to report "similarity" as a non-negative number; the
 * underlying math can return negative values for opposing vectors.
 */
export function cosineTopK(
  query: number[],
  entries: CosineEntry[],
  k: number,
): CosineResult[] {
  if (k <= 0 || entries.length === 0) {
    return [];
  }
  const scored = entries.map((entry) => ({
    id: entry.id,
    score: cosineSimilarity(query, entry.vector),
  }));
  scored.sort((a, b) => {
    if (a.score !== b.score) {
      return b.score - a.score;
    }
    return a.id.localeCompare(b.id);
  });
  return scored.slice(0, k).map(({ id, score }) => ({
    id,
    score: score < 0 ? 0 : score,
  }));
}
