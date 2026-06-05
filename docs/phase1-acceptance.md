# Phase 1 acceptance

Phase 1 of `engram-rag` v2 is considered DONE only when **all** of the
following are true. Every line below is a hard gate; do not soften or
remove any of them.

## Required commands

| # | Command | Expected outcome |
|---|---------|------------------|
| 1 | `npm install` | Exits 0. No peer-dep warnings that block subsequent steps. |
| 2 | `npm test` | Exits 0. All non-recursive Phase 1 task tests (`smoke`, `v1-forensics`, `topicKeys`, `knowledgeRecord`, `powershell-and`, `sdd-spec-gherkin`, `retrieval`, `retrievalPlan`, `noLegacyTopicKeys`, `workflow`, `phase1-acceptance`) report green. Verify-script integration tests are intentionally excluded from `npm test`; the verify scripts themselves are the closure gates. |
| 3 | `npm run verify:phase1` | Exits 0 AND writes `reports/phase1/verify-report.json`. |

## Required artifact

| Path | Required content |
|------|------------------|
| `reports/phase1/verify-report.json` | The schema from `rag-system/v2/design.md` §8: `command`, `exit_code`, `started_at`, `finished_at`, `tests_passed`, `tests_failed`, `artifacts_checked`, `metrics`. Must show `exit_code: 0` and `tests_failed: 0`. |

## Forbidden artifacts in Phase 1

| Forbidden | Why |
|-----------|-----|
| A working API server | Out of scope; belongs to Phase 5. |
| A dashboard that renders anything | Out of scope; the v1 dashboard was hardcoded data. |
| Any new observation committed to Engram by this phase | Phase 1 produces *contracts and tests*, not new knowledge. |
| Any v1 topic key alias outside `docs/evidence/v1-forensics.md` | Enforced by the `noLegacyTopicKeys` guardrail. |
| A close-out claim without a passing `verify-report.json` | This document is the explicit rejection of that anti-pattern. |

## Workflow

```text
1. Make a change to code, fixtures, or docs.
2. Run `npm test`. If any test fails, fix the production code first,
   the test second. Never silence a test.
3. Run `npm run verify:phase1`. The report file is rewritten on
   every run; commit it (or its diff) only when the change is
   complete and green.
4. Open a PR. The CI workflow runs `npm ci`, `npm test`,
   `npm run verify:phase1`, and (from Phase 2 onward)
   `npm run verify:phase2` on every push and pull request.
5. Merge only when CI is green AND the local `verify-report.json`
   from step 3 shows zero failures.
```

## Relationship to the v1 close-out

`rag-system/fase-final/CIERRE-FASES.md` declared Phase 1-8 complete
on 2026-05-05 with no `verify-report.json`, no tests, and a
dashboard built from hardcoded JS literals. The Engram observation
`#728` (`engram-rag/repo-state-2026-06-05`) records the gap.

This document is the explicit rejection of that closure pattern. A
phase is done when its verify report says so, not when a Markdown
file says so.
