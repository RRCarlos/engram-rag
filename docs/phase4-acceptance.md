# Phase 4 Acceptance Contract

Phase 4 is the **evaluation harness** for the retrieval stack. It
ships five acceptance gates (G1-G5) that the closure script
`verify:phase4` enforces on every CI run.

## What Phase 4 delivers

1. Five canonical scenarios in `eval/scenarios/` that exercise
   every known failure surface in the v2 knowledge base.
2. A pure scoring function (`src/eval/score.ts`) that turns a
   retrieval output into a `Score` with top-k hit rates,
   missing items, latency, and a pass/fail decision.
3. A scenario loader (`src/eval/suites.ts`) that reads
   `eval/scenarios/*.json`, parses them through the Zod
   contract, and fails fast on any forbidden v1 topic alias.
4. A runner (`src/eval/runScenario.ts`) that drives each
   scenario through the fake Engram adapter (the only adapter
   in Phase 4; the live adapter is Phase 5).
5. A CLI (`src/cli/eval.ts`) that runs the whole suite, writes
   an `EvalReport` to `reports/phase4/eval-report.json`, and
   exits 0 only when every scenario passes.

## The five gates

| ID | Description | Enforced by |
| --- | --- | --- |
| G1 | ≥ 5 scenarios pass against the fake adapter | `verify:phase4` |
| G2 | Aggregate `top3_hit_rate >= 0.6` | `verify:phase4` |
| G3 | Every `expected_record_topic_keys` resolves to a real fixture | `verify:phase4` (scenarios resolve at load time too, via `suites.ts`) |
| G4 | No forbidden v1 topic alias in the eval report | `verify:phase4` (the source-tree guardrail is `test/guardrails/noLegacyTopicKeys.test.ts`) |
| G5 | The eval report's `metrics.canonical_topic_key` is the v2 protocol key | `verify:phase4` |

## What G1 asserts

`G1` is the suite-shape gate. The runner must execute at least
5 scenarios AND none of them may fail. Each scenario's pass
state comes from `Score.pass` in the eval report, which is set
by `scoreRetrieval` per these rules:

- `top3_hit_rate >= 0.6` (the `MIN_TOP3_HIT_RATE` constant in
  `src/eval/score.ts`).
- `missing_expected_rules` is empty.
- `latency_ms <= max_latency_ms` (the per-scenario budget).
- `degraded == false` (no retrieval step threw).

A scenario that fails any of those rules does not count as
"passed", and G1 fails if any scenario failed.

## What G2 asserts

`G2` is the aggregate-quality gate. The mean `top3_hit_rate`
across every scenario in the eval report must be `>= 0.6`.
The scenario-level gate requires 0.6 too, so G2 is a redundant
sanity check that catches drift if someone lowers
`MIN_TOP3_HIT_RATE` or removes a scenario that was masking a
regression.

## What G3 asserts

`G3` is the data-integrity gate. Every entry in a scenario's
`expected_record_topic_keys` must match a `topic_key` in
`fixtures/knowledge/*.json`. A typo in a scenario JSON that
references a non-existent fixture is a developer error, not
a runtime failure of the adapter, so this is caught at
load time by `suites.ts` and re-checked at verify time by
`verifyPhase4.ts`.

## What G4 asserts

`G4` is the protocol-stability gate. The eval report must not
contain any of the forbidden v1 topic aliases from
`src/contracts/topicKeys.ts`:

- `protocol/rigor`
- `protocol/rigor/v1`
- `pattern/agent-rigor-protocol`
- `pattern/agent-rigor-protocol-v1-master`
- `sdd/engram-rag-fase-2/`

The source-tree guardrail
(`test/guardrails/noLegacyTopicKeys.test.ts`) is the primary
defense; this gate is the runtime check that ensures the eval
report itself is clean.

## What G5 asserts

`G5` is the protocol-promotion gate. The eval report's
`metrics.canonical_topic_key` field must equal
`engram-rag/agent-rigor-protocol/v2`. This is the single line
of evidence that downstream agents and CI consumers can use
to know which protocol version a given evaluation was run
against.

## How to run

```bash
npm run eval           # writes reports/phase4/eval-report.json
npm run verify:phase4  # writes reports/phase4/verify-report.json
```

`verify:phase4` runs the full test suite, runs `eval`,
re-reads the report, evaluates G1-G5, and exits 0 only when
every gate passes.

## Live result (Phase 4 PR-C, main `f940cc6`)

```
$ npm run eval
Phase 4 eval — suite: phase4-default (fake adapter)
scenarios: 5  passed: 5  failed: 0
metrics: top1=0.200  top3=1.000  p95_latency_ms=1.7  degraded=0
  [PASS] convention-skill-frontmatter latency_ms=1.7
  [PASS] powershell-and latency_ms=0.3
  [PASS] sdd-spec-gherkin latency_ms=0.2
  [PASS] shell-unknown-shell latency_ms=0.2
  [PASS] spec-gherkin-with-extra-noise latency_ms=0.2
report: C:\Users\PC\engram-rag\reports\phase4\eval-report.json
```

```
$ npm run verify:phase4
[verify:phase4] exit=0 passed=357 failed=0 artifacts_missing=0
  gates=[PASS] G1 [PASS] G2 [PASS] G3 [PASS] G4 [PASS] G5
  report=...\reports\phase4\verify-report.json
```

## Why this is enough for Phase 5

Phase 5 introduces a live Engram adapter and a Fastify HTTP
service. The eval harness from Phase 4 is the regression net
for that work: any change to the planner, the adapter, or the
preflight runner that breaks a top-k hit rate below 0.6 will
fail G2 in CI. Phase 5 will add new scenarios that exercise
the live adapter and the HTTP service; the G1-G5 framework
absorbs them with no structural changes.
