import { describe, expect, it } from "vitest";
import {
  MIN_TOP3_HIT_RATE,
  missingItems,
  scoreRetrieval,
  topKHitRate,
} from "../../src/eval/score.js";

describe("topKHitRate", () => {
  it("returns 1 when expected is empty", () => {
    expect(topKHitRate([], ["a", "b", "c"], 3)).toBe(1);
  });

  it("returns 1 when k covers all expected items in retrieval order", () => {
    expect(topKHitRate(["a", "b"], ["a", "b", "c", "d"], 3)).toBe(1);
  });

  it("returns the fraction of expected items found in the first k retrieved", () => {
    expect(topKHitRate(["a", "b", "c"], ["a", "x", "b"], 3)).toBeCloseTo(2 / 3, 5);
  });

  it("respects k=1 by counting only the top of retrieval", () => {
    // Top of retrieval is "x" which is not expected → 0 hits in k=1.
    expect(topKHitRate(["a", "b"], ["x", "a", "b"], 1)).toBe(0);
    // Top of retrieval is "a" which IS one of the two expected → 1/2 hits in k=1.
    expect(topKHitRate(["a", "b"], ["a", "b"], 1)).toBe(0.5);
    // Single expected item, present at the very top → 1 hit in k=1.
    expect(topKHitRate(["a"], ["a", "b", "c"], 1)).toBe(1);
  });

  it("returns 0 when none of the expected items are in retrieval", () => {
    expect(topKHitRate(["a", "b"], ["x", "y", "z"], 5)).toBe(0);
  });
});

describe("missingItems", () => {
  it("preserves expected order", () => {
    expect(missingItems(["c", "a", "b"], ["a"])).toEqual(["c", "b"]);
  });

  it("returns empty when every expected item is present", () => {
    expect(missingItems(["a", "b"], ["b", "a", "c"])).toEqual([]);
  });

  it("returns the full expected set when retrieved is empty", () => {
    expect(missingItems(["a", "b"], [])).toEqual(["a", "b"]);
  });
});

describe("MIN_TOP3_HIT_RATE", () => {
  it("is 0.6 by design", () => {
    expect(MIN_TOP3_HIT_RATE).toBe(0.6);
  });
});

describe("scoreRetrieval", () => {
  it("passes when top3 hit rate meets the threshold, rules match, latency OK, and not degraded", () => {
    const score = scoreRetrieval({
      scenario_id: "ok",
      expected_record_topic_keys: ["a", "b", "c"],
      retrieved_record_topic_keys: ["a", "b", "c", "d", "e"],
      expected_applied_rules: ["rule-1"],
      retrieved_applied_rules: ["rule-1"],
      latency_ms: 50,
      latency_budget_ms: 2000,
      degraded: false,
    });
    expect(score.pass).toBe(true);
    // All 3 expected items are in the first 3 retrieved (k1 = 1/3 = 0.333, k3 = 1.0, k5 = 1.0).
    expect(score.top_k_hit_rate).toEqual({ k1: 1 / 3, k3: 1, k5: 1 });
    expect(score.missing_expected_records).toEqual([]);
    expect(score.missing_expected_rules).toEqual([]);
    expect(score.latency_breached).toBe(false);
    expect(score.degraded).toBe(false);
  });

  it("fails when a rule is missing even if the records are perfect", () => {
    const score = scoreRetrieval({
      scenario_id: "missing-rule",
      expected_record_topic_keys: ["a"],
      retrieved_record_topic_keys: ["a"],
      expected_applied_rules: ["rule-1", "rule-2"],
      retrieved_applied_rules: ["rule-1"],
      latency_ms: 5,
      latency_budget_ms: 2000,
      degraded: false,
    });
    expect(score.pass).toBe(false);
    expect(score.missing_expected_rules).toEqual(["rule-2"]);
  });

  it("fails when top3 hit rate is below 0.6", () => {
    const score = scoreRetrieval({
      scenario_id: "low-hit-rate",
      expected_record_topic_keys: ["a", "b", "c", "d", "e"],
      retrieved_record_topic_keys: ["a", "x", "y", "z", "w"],
      expected_applied_rules: [],
      retrieved_applied_rules: [],
      latency_ms: 5,
      latency_budget_ms: 2000,
      degraded: false,
    });
    // 1 of 5 expected in top 3 = 0.2 < 0.6
    expect(score.top_k_hit_rate.k3).toBeCloseTo(0.2, 5);
    expect(score.pass).toBe(false);
  });

  it("fails when degraded is true", () => {
    const score = scoreRetrieval({
      scenario_id: "degraded",
      expected_record_topic_keys: ["a"],
      retrieved_record_topic_keys: ["a"],
      expected_applied_rules: [],
      retrieved_applied_rules: [],
      latency_ms: 5,
      latency_budget_ms: 2000,
      degraded: true,
    });
    expect(score.pass).toBe(false);
  });

  it("fails when latency budget is breached", () => {
    const score = scoreRetrieval({
      scenario_id: "slow",
      expected_record_topic_keys: ["a"],
      retrieved_record_topic_keys: ["a"],
      expected_applied_rules: [],
      retrieved_applied_rules: [],
      latency_ms: 9999,
      latency_budget_ms: 2000,
      degraded: false,
    });
    expect(score.latency_ms).toBe(9999);
    expect(score.latency_breached).toBe(true);
    expect(score.pass).toBe(false);
  });

  it("latency exactly at budget is not a breach", () => {
    const score = scoreRetrieval({
      scenario_id: "edge",
      expected_record_topic_keys: ["a"],
      retrieved_record_topic_keys: ["a"],
      expected_applied_rules: [],
      retrieved_applied_rules: [],
      latency_ms: 2000,
      latency_budget_ms: 2000,
      degraded: false,
    });
    expect(score.latency_breached).toBe(false);
    expect(score.pass).toBe(true);
  });

  it("counts missing expected records regardless of k", () => {
    const score = scoreRetrieval({
      scenario_id: "missing-record",
      expected_record_topic_keys: ["a", "b"],
      retrieved_record_topic_keys: ["a", "x", "y", "z", "w"],
      expected_applied_rules: [],
      retrieved_applied_rules: [],
      latency_ms: 5,
      latency_budget_ms: 2000,
      degraded: false,
    });
    expect(score.missing_expected_records).toEqual(["b"]);
    // 1 of 2 in top 3 = 0.5 < 0.6
    expect(score.top_k_hit_rate.k3).toBeCloseTo(0.5, 5);
    expect(score.pass).toBe(false);
  });
});
