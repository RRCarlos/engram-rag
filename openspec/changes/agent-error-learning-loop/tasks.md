# Tasks: Agent Error Learning Loop

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 900-1,400; PR target <=400 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 #27 -> PR2 #28 -> PR3 #29 -> PR4 #30 -> PR5 #31 -> PR6 #32 |
| Delivery strategy | auto-forecast |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

## Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Recover `#152` and PowerShell correction despite poisoned hits | PR1 / #27 | P0 gate. |
| 2 | Enforce typed correction/block before shell/write | PR2 / #28 | Needs PR1. |
| 3 | Expose operational MCP tools | PR3 / #29 | Preserve `rag_*`. |
| 4 | Add traces, metrics, fake/live eval parity | PR4 / #30 | Needs PR2. |
| 5 | Stabilize verification and docs/config | PR5 / #31 | Non-recursive checks. |
| 6 | Fix document-RAG correctness debt | PR6 / #32 | After P0/P1. |

## PR1 / #27: Resilient Consult P0

- [x] 1.1 RED: add `test/engram/*` regression proving `#152` is consulted for PowerShell `&&`.
- [x] 1.2 Modify `src/engram/liveEngramAdapter.ts` to quarantine invalid records without dropping valid hits.
- [x] 1.3 Modify `src/engram/runPreflight.ts` to return consulted IDs, applied rule text, quarantines, and missing records.
- [x] 1.4 Update `src/cli/preflightLive.ts` JSON so `PowerShell && -> #152 -> cmd1; if ($?) { cmd2 }` passes.
- [x] 1.5 Verify with `npm test`, `npx tsc --noEmit`, and focused P0 CLI smoke.

## PR2 / #28: Typed Enforcement

- [x] 2.1 RED: add tests for corrected PowerShell and degraded shell/write blocking.
- [x] 2.2 Create `src/engram/enforcement.ts` with `PreflightEnforcement` and pure `allow|correct|blocked` logic.
- [x] 2.3 Wire enforcement into `src/engram/runPreflight.ts` and `src/cli/preflightLive.ts` output.
- [x] 2.4 Verify shell/write callers consume typed correction instead of prose.

## PR3 / #29: Operational MCP Tools

- [x] 3.1 Add `src/engram/EngramTools.ts` contracts for `operational_consult/apply/learn/stats`.
- [x] 3.2 Wire `src/mcp/ragServer.ts` dispatch while preserving existing `rag_*` document tools.
- [x] 3.3 Test MCP handlers use Engram memories and persist queryable learning.

## PR4 / #30: Trace and Eval Parity

- [x] 4.1 Create `src/engram/trace.ts` with deterministic trace IDs and consult/apply records.
- [x] 4.2 Add eval fixtures/tests for fake parity and optional live smoke reporting.
- [x] 4.3 Report counts for consulted IDs, quarantines, degraded, missing records, outcomes.

## PR5 / #31: Verification and Docs

- [x] 5.1 Stabilize `package.json`, `.github/workflows/ci.yml`, and verify scripts.
- [x] 5.2 Update `README.md` with MCP boundaries and Windows shell guidance.
- [x] 5.3 Run `npm test`, `npm run test:verify`, phase verifies, and `npx tsc --noEmit`.

## PR6 / #32: Document-RAG Correctness Cleanup

- [ ] 6.1 Fix `src/rag/chunker.ts` chunking and overlap validation with tests.
- [ ] 6.2 Fix corpus hash/config sensitivity in retrieval/index code with tests.
- [ ] 6.3 Fix `src/rag/embedder/hashingEmbedder.ts` sign parity and graph derivation tests.
