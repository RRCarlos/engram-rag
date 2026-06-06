import { type RagSignalScore } from "../contracts/rag.js";

export const DEFAULT_RRF_K = 60;

export type RankedEntry = {
  chunk_id: string;
  rank: number;
  score: number;
};

export type FusedEntry = {
  chunk_id: string;
  rank: number;
  score: number;
};

/**
 * Reciprocal Rank Fusion over a list of per-signal rankings.
 *
 * For each chunk that appears in any ranking, the fused score is the
 * sum of `1 / (k + rank_i)` across all signals where the chunk is
 * present. Absent ranks contribute zero, which makes fusion
 * gracefully degrade when one signal is missing.
 *
 * The result is sorted by descending fused score with a `chunk_id`
 * tie-break so the output is deterministic.
 */
export function fuseRankings(
  rankings: ReadonlyArray<ReadonlyArray<RankedEntry>>,
  k: number = DEFAULT_RRF_K,
): FusedEntry[] {
  if (!Number.isInteger(k) || k <= 0) {
    throw new Error(`rrf: k must be a positive integer (got ${k})`);
  }
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    if (ranking.length === 0) {
      // An absent signal contributes zero for every chunk.
      continue;
    }
    for (const entry of ranking) {
      if (!Number.isInteger(entry.rank) || entry.rank < 0) {
        throw new Error(
          `rrf: ranking entry rank must be a non-negative integer (got ${entry.rank})`,
        );
      }
      const contribution = 1 / (k + entry.rank);
      const current = scores.get(entry.chunk_id) ?? 0;
      scores.set(entry.chunk_id, current + contribution);
    }
  }
  const fused: FusedEntry[] = Array.from(scores.entries()).map(([chunk_id, score]) => ({
    chunk_id,
    score,
    rank: 0,
  }));
  fused.sort((left, right) => {
    if (left.score !== right.score) {
      return right.score - left.score;
    }
    return left.chunk_id.localeCompare(right.chunk_id);
  });
  return fused.map((entry, index) => ({ ...entry, rank: index }));
}

/**
 * Convenience: turn fused RRF entries into the `RagSignalScore[]` shape
 * the contract expects. The `score` is preserved (fused RRF score) and
 * the `rank` reflects the fused ordering.
 */
export function toRagSignalScores(entries: ReadonlyArray<FusedEntry>): RagSignalScore[] {
  return entries.map((entry) => ({
    chunk_id: entry.chunk_id,
    rank: entry.rank,
    score: entry.score,
  }));
}
