/**
 * Phase 4 — pure scoring function.
 *
 * Takes the actual retrieval output (record topic keys, applied
 * rules) and the expected output (record topic keys, applied
 * rules) and returns a `Score` with top-k hit rates, missing
 * items, and a pass/fail decision. The function is pure: it
 * does not touch the file system, the network, or Engram. The
 * eval runner in `runScenario.ts` drives this function.
 *
 * Pass criteria (matches `rag-system/v2/design.md` §6):
 *   1. `top3_hit_rate >= MIN_TOP3_HIT_RATE` (default 0.6)
 *   2. `missing_expected_rules` is empty
 *   3. `degraded` is false
 * The latency budget is enforced by the runner, not the
 * scorer, because the scorer does not own timing.
 */
import type { Score } from "./types.js";

export const MIN_TOP3_HIT_RATE = 0.6;

export interface ScoringInput {
  scenario_id: string;
  expected_record_topic_keys: string[];
  retrieved_record_topic_keys: string[];
  expected_applied_rules: string[];
  retrieved_applied_rules: string[];
  latency_ms: number;
  latency_budget_ms: number;
  degraded: boolean;
}

/**
 * Compute the top-k hit rate for a single k. "Hit" means the
 * expected topic key is in the first k retrieved topic keys, in
 * retrieval order. Returns a fraction in [0, 1].
 */
export function topKHitRate(expected: string[], retrieved: string[], k: number): number {
  if (expected.length === 0) return 1;
  const head = retrieved.slice(0, k);
  const hits = expected.filter((key) => head.includes(key)).length;
  return hits / expected.length;
}

/**
 * Compute the items present in `expected` but missing from `retrieved`.
 * Order is preserved from `expected`.
 */
export function missingItems(expected: string[], retrieved: string[]): string[] {
  const retrievedSet = new Set(retrieved);
  return expected.filter((item) => !retrievedSet.has(item));
}

export function scoreRetrieval(input: ScoringInput): Score {
  const top1 = topKHitRate(input.expected_record_topic_keys, input.retrieved_record_topic_keys, 1);
  const top3 = topKHitRate(input.expected_record_topic_keys, input.retrieved_record_topic_keys, 3);
  const top5 = topKHitRate(input.expected_record_topic_keys, input.retrieved_record_topic_keys, 5);

  const missingExpectedRecords = missingItems(
    input.expected_record_topic_keys,
    input.retrieved_record_topic_keys,
  );
  const missingExpectedRules = missingItems(
    input.expected_applied_rules,
    input.retrieved_applied_rules,
  );

  const latency_breached = input.latency_ms > input.latency_budget_ms;

  const pass =
    top3 >= MIN_TOP3_HIT_RATE &&
    missingExpectedRules.length === 0 &&
    latency_breached === false &&
    input.degraded === false;

  return {
    scenario_id: input.scenario_id,
    expected_record_topic_keys: input.expected_record_topic_keys,
    retrieved_record_topic_keys: input.retrieved_record_topic_keys,
    expected_applied_rules: input.expected_applied_rules,
    retrieved_applied_rules: input.retrieved_applied_rules,
    top_k_hit_rate: { k1: top1, k3: top3, k5: top5 },
    missing_expected_records: missingExpectedRecords,
    missing_expected_rules: missingExpectedRules,
    latency_ms: input.latency_ms,
    latency_budget_ms: input.latency_budget_ms,
    latency_breached,
    degraded: input.degraded,
    pass,
  };
}
