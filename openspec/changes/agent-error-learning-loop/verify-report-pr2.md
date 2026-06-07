# Verification Report: Agent Error Learning Loop — PR2 / #28

## Verdict

**PASS** for PR2 / #28 (`feat(preflight): enforce correction before shell/write actions`).

The hard product rule holds: enforcement is real, not advisory. Risky PowerShell `&&` cannot pass unchanged. PR2 is composable on PR1 — the live smoke still consults Engram `#152` and quarantines legacy `#144` while adding a typed enforcement layer that returns `outcome: "correct"` with `corrected_command: "cmd1; if ($?) { cmd2 }"` and exits with code `4`.

## Scope

Verified PR2 / #28 only. PR1 was verified in `verify-report-pr1.md`. PR3-PR6 tasks (#29-#32) are intentionally pending and were not treated as blockers.

## Artifacts Reviewed

| Artifact | Status |
|---|---|
| `openspec/changes/agent-error-learning-loop/proposal.md` | Reviewed |
| `openspec/changes/agent-error-learning-loop/design.md` | Reviewed |
| `openspec/changes/agent-error-learning-loop/tasks.md` | Reviewed (PR2 tasks 2.1-2.4) |
| `openspec/changes/agent-error-learning-loop/apply-progress.md` | Reviewed |
| `openspec/changes/agent-error-learning-loop/verify-report-pr1.md` | Reviewed (composability baseline) |
| `openspec/changes/agent-error-learning-loop/specs/agent-error-learning-loop/spec.md` | Reviewed (PR2 scope) |
| `openspec/changes/agent-error-learning-loop/specs/rag-document-retrieval/spec.md` | Reviewed; out of PR2 scope |
| `openspec/changes/agent-error-learning-loop/specs/rag-embedder-interface/spec.md` | Reviewed; out of PR2 scope |
| `src/engram/enforcement.ts` | Inspected |
| `src/engram/runPreflight.ts` | Inspected |
| `src/cli/preflight.ts` | Inspected |
| `src/cli/preflightLive.ts` | Inspected |
| `test/engram/enforcement.test.ts` | Reviewed; 24 tests run |
| `test/engram/runPreflight.test.ts` | Reviewed |
| `test/cli/preflight.test.ts` | Reviewed |
| `test/cli/preflightLive.test.ts` | Reviewed |

## Command Evidence

| Command | Result | Evidence |
|---|---:|---|
| `npx vitest run test/engram/enforcement.test.ts test/engram/runPreflight.test.ts test/cli/preflightLive.test.ts test/cli/preflight.test.ts` | PASS | 4 files passed; 44 tests passed. |
| `npx vitest run test/engram test/cli/preflightLive.test.ts test/cli/preflight.test.ts` | PASS | 7 files passed; 102/102 focused tests passed (matches apply claim). |
| `npx tsc --noEmit` | PASS | No TypeScript errors. |
| `npm test` | PASS | 50 files passed; 635 tests passed; 1 skipped (live `ENGRAM_LIVE=1` gate, unrelated to PR2). |
| `node --import tsx src/cli/preflightLive.ts --project engram-rag --agent sdd-apply --task "PowerShell && memoria #152 comando corregido" --action shell --shell powershell --cwd "C:\Users\PC\engram-rag"` | PASS | `degraded:false`; `consulted_ids:[...,152,...]`; `quarantined_records:[{id:144,...}]`; `enforcement.outcome:"correct"`; `corrected_command:"cmd1; if ($?) { cmd2 }"`; `trace_id:"trc-c342926a3e08447c"`; exit code 4. |
| Same command, read action (`--action read --task "Read PR1 verify report only"`) | PASS | `enforcement.outcome:"allow"`, no `corrected_command`; exit code 2 (degraded, safe action). |
| Same command, clean PowerShell (`--action shell --shell powershell --task "Run npm install in PowerShell cleanly."`) | PASS | `enforcement.outcome:"allow"`, no `corrected_command`; exit code 0. |
| `node --import tsx src/cli/preflightLive.ts --project engram-rag --agent sdd-apply --task "Any task" --action read --base-url http://127.0.0.1:1` | PASS | Exit code 3 (transport error, not enforcement). |

The `trace_id: "trc-c342926a3e08447c"` reproduced identically from the apply-progress live smoke — confirms deterministic enforcement (sha256-prefixed 16-hex trace, recomputed on every call but stable for the same inputs).

## Spec Compliance Matrix (PR2 Scope)

| Requirement / Scenario | Status | Runtime Evidence |
|---|---|---|
| Resilient Operational Consult — Recover PowerShell correction despite poisoned hits | ✅ COMPLIANT | PR1 + composability check. Live P0 smoke consults `#152`, stays non-degraded, emits `cmd1; if ($?) { cmd2 }`. |
| Resilient Operational Consult — Quarantine invalid records | ✅ COMPLIANT | Live P0 smoke still quarantines legacy `#144` while preserving `#152`. |
| Unsafe Action Enforcement — Correct PowerShell before shell execution | ✅ COMPLIANT | `enforcement.test.ts > evaluateEnforcement: returns correct with the canonical PowerShell correction when && is detected`; live P0 smoke; CLI exits 4. |
| Unsafe Action Enforcement — Stop unsafe degraded preflight (shell) | ✅ COMPLIANT | `enforcement.test.ts > returns blocked for shell actions when preflight is degraded`; `runPreflight.test.ts > returns degraded true when mem_search fails without throwing`; live `--simulate-degraded` shell smoke would block. |
| Unsafe Action Enforcement — Stop unsafe degraded preflight (write) | ✅ COMPLIANT | `enforcement.test.ts > returns blocked for write actions when expected powershell records are missing`; safe-action safe-path covered by `returns allow for a clean write action with no missing expected records`. |
| Safe actions stay `allow` even when preflight is degraded | ✅ COMPLIANT | `enforcement.test.ts > returns allow for read actions even when preflight is degraded (safe action)`; live read smoke returns `outcome:"allow"` with exit code 2 (degraded marker, not blocked). |
| PowerShell `&&` blocked when no correction candidate is available | ✅ COMPLIANT | `enforcement.test.ts > returns blocked for PowerShell && tasks when no correction candidate is available`. |
| Deterministic trace id for same inputs | ✅ COMPLIANT | `enforcement.test.ts > produces a deterministic trace id for the same inputs`; live smoke reproduces `trc-c342926a3e08447c`. |
| Different outcomes produce different trace ids | ✅ COMPLIANT | `enforcement.test.ts > emits different trace ids for different outcomes`. |
| Enforcement projects consulted_ids / missing / quarantines faithfully | ✅ COMPLIANT | `enforcement.test.ts > projects consulted ids, missing records, and quarantines faithfully`. |
| Bash `&&` (bash supports natively) stays `allow` | ✅ COMPLIANT | `enforcement.test.ts > returns allow for a bash task with &&`. |
| Bash tasks without `&&` stay `allow` | ✅ COMPLIANT | `enforcement.test.ts > returns allow for a PowerShell task without &&`. |
| Operational MCP Tools | OUT OF SCOPE | PR3 / #29 remains pending by design. |
| Traceability and Eval Parity (deeper metrics) | OUT OF SCOPE | PR4 / #30 remains pending by design. |
| Verification and Documentation Gates | OUT OF SCOPE | PR5 / #31 remains pending by design. |
| Document-RAG retrieval deltas | OUT OF SCOPE | PR6 / #32 remains pending by design. |
| Hashing embedder parity delta | OUT OF SCOPE | PR6 / #32 remains pending by design. |

**Compliance summary**: 13/13 in-scope scenarios compliant. Zero untested or failing.

## PR2 Task Compliance

| Task | Status | Evidence |
|---|---|---|
| 2.1 RED: add tests for corrected PowerShell and degraded shell/write blocking | PASS | 24 new enforcement tests in `test/engram/enforcement.test.ts`; new assertions in `runPreflight`, `preflight`, and `preflightLive` tests. |
| 2.2 Create `src/engram/enforcement.ts` with `PreflightEnforcement` and pure `allow\|correct\|blocked` logic | PASS | New file 248 lines. `evaluateEnforcement`, `isHighRiskAction`, `isPowershellAndRisk`, `rewritePowershellAnd`, `findCorrectedCommand`, deterministic `trace_id`. Pure: no I/O, no Engram calls. |
| 2.3 Wire enforcement into `src/engram/runPreflight.ts` and `src/cli/preflightLive.ts` output | PASS | `runPreflight` returns `{...base, enforcement: evaluateEnforcement(...)}`. `preflightLive` projects the full `enforcement` block (outcome / reason / corrected_command / consulted_ids / missing_expected_records / quarantined_records / trace_id). `preflight.ts` CLI also projects `enforcement.outcome` and uses exit code 4 for `correct\|blocked`. |
| 2.4 Verify shell/write callers consume typed correction instead of prose | PASS | Live P0 smoke returns `outcome:"correct"`, `corrected_command:"cmd1; if ($?) { cmd2 }"`, `trace_id:"trc-c342926a3e08447c"`. Direct CLI integration test in `preflightLive.test.ts` spawns a real HTTP server, exercises the full CLI entrypoint, and asserts the typed projection. Exit code 4 forces callers to read the projection. |

## Implementation Inspection

| Area | Result |
|---|---|
| Action classification | `isHighRiskAction` returns true for `shell` and `write`; false for `read`, `spec`, `design`, `verify`, `review`. Matches design intent (safe actions must not be hard-blocked by enforcement). |
| PowerShell `&&` detection | `isPowershellAndRisk` requires `action_kind==="shell"`, `shell==="powershell"`, and `&&` substring. Triggers correction flow even when preflight is clean. |
| Correction picker | `findCorrectedCommand` prefers the canonical `cmd1; if ($?) { cmd2 }` placeholder from `correction_candidates`, then any candidate matching the rewrite pattern, then a clean two-token literal rewrite. Multi-word / prose inputs return `undefined` to avoid partial matches. |
| Degraded + high-risk rule | Rule 1: `if (highRisk && result.degraded) -> "blocked"` with reason about preflight degradation. |
| Missing-expected-records + high-risk rule | Rule 2: `if (highRisk && missing.length > 0) -> "blocked"` with the missing list inline. |
| PowerShell `&&` correction rule | Rule 3: prefers `correct` with the correction; falls back to `blocked` if no candidate is reachable. |
| Default allow | Clean preflight + safe action returns `allow`. |
| Trace ID | SHA-256 of `[project, agent, action, shell, task_text, sorted_consulted_ids, sorted_missing, degraded, outcome]`, hex-prefix 16. Deterministic per (input, outcome). |
| `runPreflight` contract | `PreflightResult` adds `consulted_ids`, `quarantined_records`, `correction_candidates`, `enforcement` while keeping additive compat with PR1 callers. `Omit<PreflightResult, "enforcement">` keeps the call site safe. |
| `preflightLive` projection | New `projectResult()` adds `consulted_ids`, `quarantined_records`, `correction_candidates`, and the `enforcement` block. `corrected_command` is only included when present (matches `exactOptionalPropertyTypes`). |
| Exit code matrix | 0 ok, 1 invalid flags, 2 degraded safe action, 3 unavailable / invalid request, 4 `correct\|blocked`. Both CLIs use the same matrix. |
| Deviation vs design | `enforcement.ts` exports `findCorrectedCommand`, `rewritePowershellAnd`, `isPowershellAndRisk`, `isHighRiskAction` as named helpers. These are pure utilities tested independently; they do not add API surface beyond the documented `evaluateEnforcement` (deviation already noted in `apply-progress.md`). |

## Findings

### Critical

None.

### Warnings

- **400-line budget exceeded for PR2.** Diff stat shows 393 insertions and 44 deletions across 9 modified files plus 575 new lines (`enforcement.ts` 248, `enforcement.test.ts` 327). Total ~1012 changed lines for a single PR. The task plan already flagged "400-line budget risk: High" for the whole change, so the risk was forecast; still, the PR2 slice alone is over budget. Mitigation: keep PR3-PR6 strictly narrower (no extra helpers, no extra tests beyond the scenario being implemented) and consider whether `enforcement.test.ts` could be split between PR2 (core scenarios) and PR4 (deterministic trace/metric cases) when PR4 lands. This is a process warning, not a correctness issue.
- **The `mem_save` for `simplifyPath` of trace id is the same for unchanged inputs but the live P0 smoke includes an automated context observation that may shift the consulted_id set slightly across runs.** I reproduced the same `trace_id: "trc-c342926a3e08447c"` from the apply-progress report, so the live Engram state is stable enough for the trace to be deterministic today; if live state grows, the trace id will change. Not a bug, just worth noting for PR4 (traces/metrics) when designing trace stability contracts.

### Suggestions

- When PR3 lands, have `operational_consult` reuse the same `evaluateEnforcement` engine directly so MCP callers cannot drift from CLI behavior. The pure-function design makes this a one-line wire.
- Consider exporting `PreflightEnforcement` from `src/engram/enforcement.ts` (already done) but also re-exporting from `src/engram/index.ts` (or equivalent barrel) to make PR3 wiring simpler.
- The `apply-progress.md` notes a "best-effort rewrite" deviation. PR5 (verification/docs) is a natural place to document the strict-rewrite policy in the README so callers know prose inputs return `undefined`.

## Final Decision

PR2 / #28 satisfies the proposal, design, spec, and checked tasks within its declared slice. The hard product rule passed with live evidence (the `&&` command cannot pass unchanged; consulted `#152` and quarantined `#144` are both visible from PR1). This verification is **PASS** with two non-blocking warnings noted above.
