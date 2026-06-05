/**
 * Phase 4 — evaluation harness contracts.
 *
 * An `EvalScenario` is a frozen, versioned input that drives the
 * retrieval stack against a known-failure situation. The expected
 * output is the set of `topic_key`s the adapter must surface plus
 * the set of human-readable rule strings the adapter must mark as
 * applied. A scenario also carries a per-scenario latency budget.
 *
 * A `Score` is the result of running one scenario through the
 * adapter: top-k hit rates against the expected set, the missing
 * expected records and rules, the observed latency, whether the
 * adapter degraded, and a pass/fail decision derived from those
 * fields.
 *
 * An `EvalReport` is the aggregate of every scenario in a suite,
 * plus aggregate metrics and the original command line. The
 * `verify:phase4` script writes this to
 * `reports/phase4/eval-report.json`.
 */
import { z } from "zod";
import { ActionKindSchema, ShellKindSchema } from "../contracts/retrieval.js";
import { AgentIdSchema } from "../contracts/knowledgeRecord.js";

export const EvalScenarioSchema = z
  .object({
    id: z.string().min(1),
    description: z.string().min(1),
    project: z.string().min(1),
    agent_id: AgentIdSchema,
    task_text: z.string().min(1),
    action_kind: ActionKindSchema,
    shell: ShellKindSchema,
    /**
     * Topic keys (one per fixture/knowledge record) the adapter
     * MUST surface for this scenario to count as a retrieval hit.
     * The eval runner does a top-k comparison against this set.
     */
    expected_record_topic_keys: z.array(z.string().min(1)).min(1),
    /**
     * Human-readable rule strings the adapter must mark as
     * `applied`. Sourced from the `failure_signature` field of
     * the knowledge record.
     */
    expected_applied_rules: z.array(z.string().min(1)),
    /**
     * Upper bound in milliseconds for the per-scenario retrieval
     * call. Default 2000 ms; per-scenario overrides allowed.
     */
    max_latency_ms: z.number().positive().default(2000),
  })
  .strict();

export const ScoreSchema = z
  .object({
    scenario_id: z.string().min(1),
    expected_record_topic_keys: z.array(z.string()),
    retrieved_record_topic_keys: z.array(z.string()),
    expected_applied_rules: z.array(z.string()),
    retrieved_applied_rules: z.array(z.string()),
    top_k_hit_rate: z.object({
      k1: z.number().min(0).max(1),
      k3: z.number().min(0).max(1),
      k5: z.number().min(0).max(1),
    }),
    missing_expected_records: z.array(z.string()),
    missing_expected_rules: z.array(z.string()),
    latency_ms: z.number().nonnegative(),
    latency_budget_ms: z.number().positive(),
    latency_breached: z.boolean(),
    degraded: z.boolean(),
    pass: z.boolean(),
  })
  .strict();

export const EvalReportMetricsSchema = z
  .object({
    top1_hit_rate: z.number().min(0).max(1),
    top3_hit_rate: z.number().min(0).max(1),
    p95_latency_ms: z.number().nonnegative(),
    degraded_count: z.number().int().nonnegative(),
    canonical_topic_key: z.string().min(1),
  })
  .strict();

export const EvalReportSchema = z
  .object({
    command: z.string().min(1),
    exit_code: z.number().int(),
    started_at: z.string().datetime(),
    finished_at: z.string().datetime(),
    suite: z.string().min(1),
    adapter: z.enum(["fake", "live"]),
    scenarios_total: z.number().int().nonnegative(),
    scenarios_passed: z.number().int().nonnegative(),
    scenarios_failed: z.number().int().nonnegative(),
    metrics: EvalReportMetricsSchema,
    scores: z.array(ScoreSchema),
  })
  .strict();

export type EvalScenario = z.infer<typeof EvalScenarioSchema>;
export type Score = z.infer<typeof ScoreSchema>;
export type EvalReportMetrics = z.infer<typeof EvalReportMetricsSchema>;
export type EvalReport = z.infer<typeof EvalReportSchema>;

/** Parse an `EvalScenario` from an unknown payload (JSON file or CLI). */
export function parseEvalScenario(input: unknown): EvalScenario {
  return EvalScenarioSchema.parse(input);
}

/** Parse an `EvalReport` (e.g. when the verify script re-reads its own output). */
export function parseEvalReport(input: unknown): EvalReport {
  return EvalReportSchema.parse(input);
}
