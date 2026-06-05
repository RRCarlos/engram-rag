---
title: "Engram RAG v2 — Phase 4 task plan (evaluation harness and CI gates)"
version: "2.0"
status: "active"
date: "2026-06-05"
project: "engram-rag"
artifact: "phase4-tasks"
parent_design: "rag-system/v2/design.md"
canonical_topic_key: "engram-rag/agent-rigor-protocol/v2"
---

# Phase 4 task plan

## Goal

Measure whether the preflight + adapter stack from Phase 2 actually
recovers the right knowledge for known failure scenarios, **before**
declaring any user-visible improvement. Build a repeatable harness
that runs a fixed suite of scenarios, scores retrieval (top-k hit
rate, missing expected rules, latency), and produces a CI-gated
report. Narrative metrics that humans collect in ad-hoc runs are
explicitly out of scope — the report is the only source of truth.

## Scope

| In scope | Out of scope (later phases or never) |
|----------|--------------------------------------|
| Versioned `eval/scenarios/*.json` with deterministic input and expected output. | Real LLM-as-agent evaluation (Phase 5+ at earliest; may be deferred). |
| A scenario runner that drives the Phase 2 fake adapter. | Live Engram adapter in CI (still out; fake adapter is the source of truth in CI). |
| A scoring function: top-k hit, missing rules, latency. | UI or dashboard for the eval results. |
| A `engram-rag eval` CLI with `--suite known-failures` and `--json`. | Auto-tuning of retrieval parameters (Phase 5+). |
| A `verify:phase4` script that emits `reports/phase4/eval-report.json`. | Eval scenarios beyond the 5 critical ones. |
| A CI gate that blocks merge when `top3_hit_rate` regresses below the recorded baseline. | Eval of real OpenCode skill consumption (Phase 4.5 / 5). |

## Contracts

### 4.1 Eval scenario

```ts
type EvalScenario = {
  id: string;                          // e.g. "powershell-and"
  description: string;                 // human-readable
  project: "engram-rag";               // bound to this repo for v2
  agent_id: AgentId;                   // which agent would hit this failure
  task_text: string;                   // input to the retrieval planner
  action_kind: ActionKind;             // read | write | shell | spec | design | verify | review
  shell: ShellKind;                    // powershell | bash | unknown
  expected_record_ids: string[];       // ids the adapter must surface (from fixtures/knowledge/*.json)
  expected_applied_rules: string[];    // human strings the adapter must mark as applied
  max_latency_ms: number;              // upper bound for this scenario (default 2000)
};
```

### 4.2 Score

```ts
type Score = {
  scenario_id: string;
  expected_record_ids: string[];
  retrieved_record_ids: string[];
  expected_applied_rules: string[];
  retrieved_applied_rules: string[];
  top_k_hit_rate: { k1: number; k3: number; k5: number };
  missing_expected_records: string[];
  missing_expected_rules: string[];
  latency_ms: number;
  degraded: boolean;
  pass: boolean;
};
```

`pass` is true iff:
- `top3_hit_rate >= 0.6` (≥60% of expected ids in top-3)
- `missing_expected_rules` is empty
- `latency_ms <= max_latency_ms`
- `degraded` is false

### 4.3 Eval report

```ts
type EvalReport = {
  command: string;
  exit_code: number;
  started_at: string;
  finished_at: string;
  suite: string;                       // "known-failures"
  adapter: "fake" | "live";            // CI is always "fake"
  scenarios_total: number;
  scenarios_passed: number;
  scenarios_failed: number;
  metrics: {
    top3_hit_rate: number;             // aggregate across scenarios
    top1_hit_rate: number;
    p95_latency_ms: number;
    degraded_count: number;
    canonical_topic_key: string;
  };
  scores: Score[];
};
```

## Components to create

| Path | Responsibility |
|------|----------------|
| `src/eval/types.ts` | Zod schemas for `EvalScenario`, `Score`, `EvalReport`. |
| `src/eval/runScenario.ts` | Pure async runner. Takes an `EvalScenario` + `EngramTools`, returns a `Score`. |
| `src/eval/score.ts` | Pure scoring function. Takes retrieval output + expected, returns `Score`. |
| `src/eval/suites.ts` | Loads `eval/scenarios/*.json` and validates each against the schema. Returns `EvalScenario[]`. |
| `eval/scenarios/powershell-and.json` | Phase 1 powerhell failure scenario. |
| `eval/scenarios/sdd-spec-gherkin.json` | Phase 1 gherkin scenario. |
| `eval/scenarios/no-legacy-alias.json` | Anti-regression: a scenario that, if the adapter ever returns a v1 alias, scores `pass=false`. |
| `eval/scenarios/shell-bash-failure.json` | A bash failure scenario (extends coverage beyond powershell). |
| `eval/scenarios/convention-failure.json` | A code-convention failure scenario (extracted from the v1 evidence). |
| `src/cli/eval.ts` | `engram-rag eval --suite known-failures --adapter fake --json`. Emits `reports/phase4/eval-report.json`. |
| `src/cli/verifyPhase4.ts` | Closure script. Runs the eval suite, asserts all scenarios pass, reports metrics. |
| `test/eval/score.test.ts` | Unit tests for the scoring function. |
| `test/eval/runScenario.test.ts` | Integration tests for the runner against the fake adapter. |
| `test/eval/suites.test.ts` | Asserts every scenario file is parseable and valid against the schema. |
| `test/cli/eval.test.ts` | Asserts the CLI emits the report and exits 0 on success. |
| `test/cli/verifyPhase4.test.ts` | Asserts the verify report schema, artifacts, and pass count. |
| `docs/phase4-acceptance.md` | Closure contract: commands, artifacts, behavior, gates. |
| `test/docs/phase4-acceptance.test.ts` | Mirrors the Phase 1/2/3 acceptance test style. |
| `test/ci/workflow.test.ts` | Extend to assert `verify:phase4` step is in the workflow. |
| `.github/workflows/ci.yml` | Add `Run Phase 4 verify` step. |
| `reports/phase4/.gitkeep` | Tracked placeholder. |
| `rag-system/v2/phase4-tasks.md` | This plan. |

## Chained PR plan

This phase is ~6 new files plus 5 scenario JSONs plus 5 test files plus
the CLI pair. Forecast ~2000 lines, 400-line default budget per PR.
Three chained PRs, all targeted at `main`, merge in order:

| PR | Title | Scope | Approx lines |
|----|-------|-------|--------------|
| 4-A | Eval scenarios + scoring contracts | `src/eval/{types,score}.ts` + 5 scenario JSONs + `suites.ts` + `score.test.ts` + `suites.test.ts` | ~700 |
| 4-B | Runner + eval CLI + tests | `src/eval/runScenario.ts` + `src/cli/eval.ts` + `runScenario.test.ts` + `eval.test.ts` | ~600 |
| 4-C | verify:phase4 + CI gate + acceptance doc | `src/cli/verifyPhase4.ts` + `verifyPhase4.test.ts` + `docs/phase4-acceptance.md` + `test/docs/phase4-acceptance.test.ts` + `.github/workflows/ci.yml` extension + `test/ci/workflow.test.ts` extension | ~400 |

The Phase 4 plan doc + `.gitkeep` are tracked in PR-A so the plan is
visible from the start.

## Acceptance gates

From `rag-system/v2/design.md` §6:

| # | Gate | Evidence |
|---|------|----------|
| G1 | At least 5 critical scenarios are versioned. | `eval/scenarios/*.json` count >= 5; `test/eval/suites.test.ts` asserts the count and the schema for every file. |
| G2 | `top3_hit_rate` is reported. | `reports/phase4/eval-report.json` `metrics.top3_hit_rate`; `verify:phase4` exit 0 requires the field to be present. |
| G3 | PowerShell and Gherkin recover the right rules. | `eval/scenarios/powershell-and.json` and `eval/scenarios/sdd-spec-gherkin.json`; `test/eval/runScenario.test.ts` checks the per-scenario pass. |
| G4 | CI blocks v1 aliases and fails the build when the report is missing. | The existing `noLegacyTopicKeys` guardrail plus the new `verify:phase4` step. |
| G5 | The CI workflow runs `verify:phase4` after the test suite. | `.github/workflows/ci.yml` includes the step; `test/ci/workflow.test.ts` asserts it. |

## Risks and rollbacks

| Risk | Mitigation | Rollback |
|------|-----------|----------|
| `pass` threshold is too strict for noisy retrieval | `top3_hit_rate >= 0.6` is a starting point; if all 5 scenarios hit 100% the threshold is fine. If a scenario legitimately fails, document it in the scenario file as `expected_pass: false` (mirrors the Phase 3 fixture rule). | Lower the threshold and document the regression in a follow-up PR. |
| Fake adapter diverges from live | Reuse the same fake adapter that Phase 1/2/3 already use. Live adapter evaluation is explicitly out of scope for Phase 4. | Add a live adapter smoke test in Phase 5. |
| Scenario JSONs drift from `fixtures/knowledge/*.json` | `suites.test.ts` validates every scenario against the Zod schema and asserts the referenced record ids exist in the fixtures. | Bump `fixtures/knowledge/*.json`; do not edit scenarios to make them pass. |
| Latency budget is unrealistic on CI hardware | `max_latency_ms` is per-scenario (default 2000, but each scenario can override). Aggregate `p95_latency_ms` is reported but does not gate. | Bump per-scenario budgets in the scenario JSON. |

## Out of scope (Phase 5)

- The real API and dashboard consume the eval metrics but do not
  depend on the harness itself.
- The harness runs against the fake adapter in CI. Live adapter
  evaluation is a separate concern that needs a different gate
  (rate limit, cost, determinism) and is not on the Phase 4 path.
- LLM-as-agent evaluation (the charter §5 success metric of "50%
  fewer repeated errors") is a much larger harness with its own
  fixture corpus and is deferred past Phase 5.
