# Phase 2 acceptance

Phase 2 of `engram-rag` v2 is considered DONE only when the Engram
preflight adapter is executable, degraded-safe, and proven by a generated
verify report. Narrative close-out is not sufficient.

## Required commands

| # | Command | Expected outcome |
|---|---------|------------------|
| 1 | `npm test` | Exits 0. Runs the non-recursive test suite and excludes `test/cli/verifyPhase*.test.ts` so CI does not spawn nested Vitest runs. |
| 2 | `npm run verify:phase1` | Exits 0. Phase 2 must not regress Phase 1 closure. |
| 3 | `npm run verify:phase2` | Exits 0 AND writes `reports/phase2/verify-report.json`. |
| 4 | `npm run test:verify` | Optional local integration check for the verify CLI tests. It is intentionally not part of `npm test` because it launches nested test runs. |

## Required artifact

| Path | Required content |
|------|------------------|
| `reports/phase2/verify-report.json` | The schema from `rag-system/v2/design.md` §8: `command`, `exit_code`, `started_at`, `finished_at`, `tests_passed`, `tests_failed`, `artifacts_checked`, `metrics`. Must show `exit_code: 0`, `tests_failed: 0`, `metrics.latency_ms_p95 <= 2000`, and `metrics.degraded_supported: true`. |

## Required behavior

| Behavior | Evidence |
|----------|----------|
| `mem_context` runs before `mem_search` | `test/engram/runPreflight.test.ts` checks call order. |
| Search results are fetched via `mem_get_observation` | `test/engram/runPreflight.test.ts` checks fetched IDs. |
| PowerShell failure retrieves the validated solution | `test/engram/runPreflight.test.ts` uses `fixtures/knowledge/powershell-and.json`. |
| Degraded mode does not throw | `test/engram/runPreflight.test.ts` covers `mem_search` and `mem_get_observation` failures. |
| Live MCP is kept out of CI | `test/guardrails/noLiveMcpInTests.test.ts` scans `src/` and `test/`. |

## Workflow

```text
1. Make a change to Phase 2 code, fixtures, or docs.
2. Run `npm test`.
3. Run `npm run verify:phase1`.
4. Run `npm run verify:phase2`.
5. Open a PR. CI must run all three commands and pass green.
6. Merge only when the Phase 2 report shows zero failures, latency p95 <= 2000 ms,
   and degraded support is true.
```

## Relationship to Phase 1 lessons

Phase 2 keeps the fake adapter as the primary test target, quotes verify-test globs
to avoid Linux shell expansion, and keeps heavy verify integration tests outside the
default `npm test` command to prevent recursive Vitest execution in CI.
