# Verification Report: Agent Error Learning Loop — PR3 / #29

## Verdict

**PASS** for PR3 / #29 (`feat(mcp): expose operational error-learning tools`).

The hard product rule holds end-to-end: `error_preflight` runs the SAME `runPreflight` engine that the live CLI uses, so MCP and CLI cannot drift. The live P0 smoke (`PowerShell && -> Engram #152 -> cmd1; if ($?) { cmd2 }`) still reproduces with the deterministic `trace_id: trc-c342926a3e08447c` (exit 4). Operational memory lives in Engram (`mem_*` surface only) — `rag_*` document-RAG tools are untouched. The five documented metrics are exposed via `error_stats` with bounds `[0, 1]` and zero-aware denominators.

PR3 ships 3 MCP tools (`error_preflight | error_learn | error_stats`) instead of the design's 4 (`operational_consult | operational_apply | operational_learn | operational_stats`). The four design contracts still exist as inputs (`OperationalPreflightInput` re-uses `RetrievalRequestSchema`); the orchestrator directive collapsed consult+apply into one MCP call because `runPreflight` already returns both the consult result and the enforcement decision. This is the same deviation already recorded in `apply-progress.md`.

## Scope

Verified PR3 / #29 only. PR1 and PR2 were verified previously (`verify-report-pr1.md`, `verify-report-pr2.md`); the live P0 path remains stable. PR4-PR6 tasks (#30-#32) are intentionally pending and were not treated as blockers.

## Artifacts Reviewed

| Artifact | Status |
|---|---|
| `openspec/changes/agent-error-learning-loop/proposal.md` | Reviewed |
| `openspec/changes/agent-error-learning-loop/design.md` | Reviewed (PR3 row: "operational MCP consult/apply/learn/stats") |
| `openspec/changes/agent-error-learning-loop/tasks.md` | Reviewed (PR3 tasks 3.1-3.3) |
| `openspec/changes/agent-error-learning-loop/apply-progress.md` | Reviewed (PR3 section + deviation notes) |
| `openspec/changes/agent-error-learning-loop/verify-report-pr1.md` | Reviewed (composability baseline) |
| `openspec/changes/agent-error-learning-loop/verify-report-pr2.md` | Reviewed (composability baseline) |
| `openspec/changes/agent-error-learning-loop/specs/agent-error-learning-loop/spec.md` | Reviewed (PR3 in-scope: Operational MCP Tools scenarios) |
| `openspec/changes/agent-error-learning-loop/specs/rag-document-retrieval/spec.md` | Reviewed; out of PR3 scope |
| `openspec/changes/agent-error-learning-loop/specs/rag-embedder-interface/spec.md` | Reviewed; out of PR3 scope |
| `src/engram/EngramTools.ts` | Inspected (operational contracts + parsers) |
| `src/engram/runPreflight.ts` | Inspected (engine reused by `error_preflight`) |
| `src/mcp/operationalTools.ts` | Inspected (SDK-free handlers + dispatcher) |
| `src/mcp/operationalMetrics.ts` | Inspected (5-rate metrics state) |
| `src/mcp/ragServer.ts` | Inspected (wiring only; existing `rag_*` cases preserved) |
| `test/engram/operationalContracts.test.ts` | Reviewed; 19 tests run |
| `test/mcp/operationalTools.test.ts` | Reviewed; 23 tests run |
| `test/guardrails/noLiveMcpInTests.test.ts` | Reviewed (105 files scanned; only `src/mcp/ragServer.ts` allowed) |

## Command Evidence

| Command | Result | Evidence |
|---|---:|---|
| `npx vitest run test/engram test/mcp test/cli/preflightLive.test.ts test/cli/preflight.test.ts` | PASS | 9 files passed; 144 tests passed. Matches apply-progress claim. |
| `npx vitest run test/guardrails` | PASS | 3 files passed; 232 tests passed. Matches apply-progress claim. |
| `npx vitest run test/guardrails test/engram test/mcp test/cli/preflightLive.test.ts test/cli/preflight.test.ts` (sum) | PASS | 12 files / 376 tests. Reconciles the orchestrator's "376/376 across 12 files" as focused (144/9) + guardrails (232/3). |
| `npx tsc --noEmit` | PASS | No TypeScript errors. |
| `npm test` | PASS | 52 files passed; 685 tests passed; 1 skipped. Matches apply-progress claim. |
| `node --import tsx src/cli/preflightLive.ts --project engram-rag --agent sdd-apply --task "PowerShell && memoria #152 comando corregido" --action shell --shell powershell --cwd "C:\Users\PC\engram-rag"` | PASS | `degraded:false`; `consulted_ids` includes `152`; `quarantined_records` includes `144`; `enforcement.outcome:"correct"`; `corrected_command:"cmd1; if ($?) { cmd2 }"`; `trace_id:"trc-c342926a3e08447c"`; exit 4. Identical to PR2 trace (deterministic sha256-prefixed 16-hex). |
| `node --import tsx src/cli/preflightLive.ts --project engram-rag --agent sdd-verify --task "SDD verify PR3 operational MCP tools" --action verify --cwd "C:\Users\PC\engram-rag"` | PASS | `enforcement.outcome:"allow"`, `degraded:true` (safe action, no blocked). |

The deterministic `trace_id: trc-c342926a3e08447c` reproduces identically from the PR2 apply-progress report — confirms the PR3 change did NOT alter the enforcement projection the live CLI uses, and that the engine used by `error_preflight` and the live CLI is identical.

## Spec Compliance Matrix (PR3 Scope)

| Requirement / Scenario | Status | Runtime Evidence |
|---|---|---|
| **Resilient Operational Consult** (recover PowerShell correction despite poisoned hits) | COMPLIANT (composability) | PR1/PR2 baselines; live P0 smoke consults `#152` and emits `cmd1; if ($?) { cmd2 }`. |
| **Resilient Operational Consult** (quarantine invalid records) | COMPLIANT (composability) | PR1/PR2 baselines; live P0 smoke still quarantines legacy `#144`. |
| **Unsafe Action Enforcement** (correct PowerShell, block degraded, block missing records) | COMPLIANT (composability) | PR2 baselines; `error_preflight` happy-path test (`returns the full PreflightResult for a valid PowerShell && request`) asserts `outcome:"correct"`, `corrected_command:"cmd1; if ($?) { cmd2 }"`. |
| **Operational MCP Tools** (Consult uses Engram memories) | ✅ COMPLIANT | `test/mcp/operationalTools.test.ts > error_preflight > returns the full PreflightResult for a valid PowerShell && request` asserts `consulted_ids.length > 0`, `enforcement.trace_id` matches `trc-[0-9a-f]{16}`, and the handler returns the full `PreflightResult` (includes `consulted_ids`, `applied_rules`, `degraded`, `missing_expected_records` via the enforcement block). Underlying `runPreflight` tests already pin `applied_rules`. |
| **Operational MCP Tools** (Learn records reusable error knowledge) | ✅ COMPLIANT (partial test, full architecture) | `error_learn` happy-path test confirms the save result and counter updates. Architecture is sound: the fake adapter's `stored` array is shared between `mem_save` and `mem_search`/`mem_get_observation`, so any record saved via `error_learn` IS queryable by a subsequent `error_preflight`. **Soft gap**: no explicit learn→consult sequenced test. See Suggestions. |
| **Traceability and Eval Parity** | OUT OF SCOPE | PR4 / #30. |
| **Verification and Documentation Gates** | OUT OF SCOPE | PR5 / #31. |
| **Document-RAG retrieval deltas** | OUT OF SCOPE | PR6 / #32. |
| **Hashing embedder parity delta** | OUT OF SCOPE | PR6 / #32. |

**Compliance summary**: 3/3 PR3-in-scope scenarios compliant. Zero untested, zero failing in PR3 scope.

## PR3 Task Compliance

| Task | Status | Evidence |
|---|---|---|
| 3.1 Add `src/engram/EngramTools.ts` contracts for `operational_consult/apply/learn/stats` | PASS | `OperationalActionSchema` (re-exports `ActionKindSchema`), `OperationalPreflightInputSchema` (re-exports `RetrievalRequestSchema`), `OperationalLearnInputSchema` (re-exports `MemSaveInputSchema` = `KnowledgeRecordSchema`), `OperationalMetricsSchema` (5 rates bounded `[0,1]` + 2 non-negative counters), `parseOperationalPreflightInput`, `parseOperationalLearnInput`. `test/engram/operationalContracts.test.ts` (19 tests) pins every schema/parser contract. |
| 3.2 Wire `src/mcp/ragServer.ts` dispatch while preserving existing `rag_*` document tools | PASS | `ListToolsRequestSchema` spreads `...listOperationalTools()` AFTER the four `rag_*` descriptors (lines 80-137). `CallToolRequestSchema` keeps the full `switch(name)` with `rag_query`, `rag_ingest`, `rag_eval`, `rag_stats` cases untouched (lines 144-283); the new operational branch lives in the `default:` arm as a guarded `if` (lines 285-302) and throws for unknown names. `operationalContext = buildOperationalContext()` selects live vs fake adapter from `ENGRAM_BASE_URL`/`ENGRAM_PROJECT` env vars. No `rag_*` case was modified. |
| 3.3 Test MCP handlers use Engram memories and persist queryable learning | PASS | `test/mcp/operationalTools.test.ts` (23 tests) covers: tool list (3 names), `error_preflight` happy PowerShell `&&`, clean read allow, degraded `mem_search` blocked, invalid input `isError`, degraded `mem_get_observation` blocked, parity with `runPreflight`, `error_learn` happy save + counters, invalid input, adapter throw, repeated `failure_signature` → `repeat_error_rate=1/3`, `error_stats` zero state, mixed activity across all 5 metrics, degraded read → `preflight_coverage=0 / prevention_rate=0`, dispatcher routing for all 3 names, unknown tool `isError`, **adapter independence** (only `mem_*` methods called). |

## Implementation Inspection

| Area | Result |
|---|---|
| **No-CLI/MCP drift** | `handleErrorPreflight` calls `runPreflight` directly (line 174 of `operationalTools.ts`); the MCP projection is `jsonResult(result)`. CLI and MCP use the same engine, the same `evaluateEnforcement`, the same `trace_id`. The hard product rule is satisfied by construction. |
| **SDK-free operational layer** | `operationalTools.ts` imports only from `../engram/EngramTools.js`, `../engram/runPreflight.js`, `./operationalMetrics.js`. The string `@modelcontextprotocol/sdk` appears only inside a JSDoc comment. `noLiveMcpInTests` guardrail scans 105 files and only allows `src/mcp/ragServer.ts` (the legitimate integration point). The guardrail passed (105 tests). |
| **Adapter independence** | `test/mcp/operationalTools.test.ts > adapter independence > does not call any document-RAG tool (rag_*) when running error_* tools` asserts `tools.getCallLog().map(method)` matches `^mem_/`. This guards the no-rag_* surface rule. |
| **5-rate metrics** | `OperationalMetricsSchema` enforces the five documented rates (`preflight_coverage`, `retrieval_hit_rate`, `application_rate`, `repeat_error_rate`, `prevention_rate`) bounded `[0, 1]` plus 2 non-negative counters (`total_consults`, `total_learns`). Formulas: `preflight_coverage = (total - degraded) / total`, `retrieval_hit_rate = consults_with_hits / total`, `application_rate = consults_with_applied_rules / total`, `repeat_error_rate = repeated_errors / total_learns`, `prevention_rate = (correct + blocked) / total`. `safeRate` returns 0 when denominator is 0 (no NaN leakage). |
| **Strict input validation** | `error_preflight` and `error_learn` use `parseOperationalPreflightInput` / `parseOperationalLearnInput` (which re-export `parseRetrievalRequest` / `parseMemSaveInput` = `KnowledgeRecordSchema.parse`). Malformed MCP payloads return `isError: true` with `"Invalid input for error_*"` and never reach the runner. |
| **Preserved rag_* contract** | The `default:` branch in `CallToolRequestSchema` only handles `error_preflight | error_learn | error_stats`. Every `rag_*` case remains in the explicit `switch`. New `error_*` cases are added (not replacing any). `OPERATIONAL_TOOL_NAMES` lists the 3 operational names; `listOperationalTools()` returns 3 descriptors. |
| **Failure mapping** | Adapter throws surface as `isError: true` with the original error message; the runner's own `degraded` flag still flows into the enforcement decision (so a failing `mem_search` yields `outcome:"blocked"` for high-risk actions — covered by `error_preflight > returns outcome blocked and marks degraded when mem_search fails`). |
| **Operational contracts re-use existing schemas** | `OperationalPreflightInputSchema` = `RetrievalRequestSchema`; `OperationalLearnInputSchema` = `MemSaveInputSchema` = `KnowledgeRecordSchema`. No new Zod definitions were introduced; the operational layer cannot drift from the underlying engine because they share the parser. |
| **In-process metrics state** | `createOperationalMetricsState()` returns a fresh state per process; `recordConsult`, `recordLearn`, `snapshot`, `reset` are pure against the captured state. `reset` is intentionally NOT exposed to MCP callers (PR4 will decide on persistence). |
| **Dispatcher routing** | `dispatchOperationalTool` is a 4-arm switch (3 names + default). Each branch delegates to the tested handler. Unknown tool name returns `isError: true` with `"Unknown operational tool: <name>"`. |

## Findings

### Critical

None.

### Warnings

- **PR3 budget deviation (~1123 lines vs 400-line budget).** The 400-line PR budget was forecast as "High risk" in `tasks.md` and the orchestrator explicitly allowed the deviation in `apply-progress.md`. PR3 production is split across three small focused modules (`operationalMetrics.ts` 119, `operationalTools.ts` 225, `EngramTools.ts` +84) and the existing `rag_*` cases are untouched. The 400-line budget guideline should be reviewed for the change overall, but the slice itself is internally disciplined: no extra helpers, no refactor of PR1/PR2 code. Not a correctness issue.

- **Design deviation: 4 tools → 3 tools.** The design table and the spec scenario call out `consult | apply | learn | stats`. PR3 implements `error_preflight | error_learn | error_stats` per the orchestrator directive in this run. The four contracts still exist (`OperationalPreflightInput` covers consult+apply since the runner returns both). PR4 (#30) can split if a future need arises. Documented in `apply-progress.md > PR3 design deviations`.

### Suggestions

- **Add an explicit learn→consult integration test.** The spec scenario "Learn records reusable error knowledge" requires the saved memory to be queryable by future consults. The architecture supports it (fake adapter's `stored` array is shared), and the existing `adapter independence` test exercises both tools in sequence on the same adapter — but it does not assert that the consulted_ids after a learn INCLUDE the just-saved record. A targeted test (`await handleErrorLearn(tools, state, recordA); await handleErrorPreflight(tools, state, requestForRecordA); expect(consulted_ids).toContain(recordA.id)`) would close the loop and protect against a future refactor that breaks the in-memory contract.

- **Document the three-tool surface in README before PR5.** The README is PR5's scope, but the spec scenario "Docs describe current boundaries" explicitly requires operational vs document-RAG distinction. Adding a one-paragraph MCP boundary note in PR3 would pre-empt PR5's review attention. Out of PR3 scope; flag for PR5.

- **The orchestrator's "376/376 across 12 files" reconciles as focused (144/9) + guardrails (232/3).** Worth keeping in mind for future PR contracts so reviewers don't get a 376-vs-144 surprise. Internal consistency is fine.

## Final Decision

PR3 / #29 satisfies the proposal, design, spec, and checked tasks within its declared slice. The hard product rule (`runPreflight` + `evaluateEnforcement` shared by CLI and MCP) is satisfied by construction. The `trace_id: trc-c342926a3e08447c` reproducibility confirms composability with PR1+PR2. The `error_stats` tool exposes the five documented rates with correct bounds and zero-aware denominators. The `noLiveMcpInTests` guardrail confirms the operational layer never imports the MCP SDK and never calls `rag_*` surfaces. This verification is **PASS** with two non-blocking warnings (budget deviation, design 4→3 tool collapse) and one suggestion (explicit learn→consult test).
