# Phase 3 acceptance

Phase 3 of `engram-rag` v2 is considered DONE only when the skill
integration layer — render, patch, verify, install, and the
verify gate — is executable, idempotent under a dry-run, and
proven by a generated verify report. Narrative close-out is not
sufficient.

## Required commands

| # | Command | Expected outcome |
|---|---------|------------------|
| 1 | `npm test` | Exits 0. Runs the non-recursive test suite and excludes `test/cli/verifyPhase*.test.ts` so CI does not spawn nested Vitest runs. |
| 2 | `npm run verify:phase1` | Exits 0. Phase 3 must not regress Phase 1 closure. |
| 3 | `npm run verify:phase2` | Exits 0. Phase 3 must not regress Phase 2 closure. |
| 4 | `npm run verify:phase3` | Exits 0 AND writes `reports/phase3/verify-report.json` with `metrics.dry_run_idempotent: true` and `metrics.fixtures_actual_pass == metrics.fixtures_expected_pass`. |
| 5 | `npm run test:verify` | Optional local integration check for the verify CLI tests. It is intentionally not part of `npm test` because it launches nested test runs. |

## Required artifacts

| Path | Required content |
|------|------------------|
| `src/skills/renderRagBlock.ts` | Pure renderer for the canonical block. Deterministic: same agent in, same string out. No timestamps. |
| `src/skills/patchSkill.ts` | Pure patcher. Idempotent (second run returns `changed: false` with reason `"block already up to date"`). Refuses files without YAML frontmatter. |
| `src/skills/verifySkill.ts` | Pure verifier. Returns `{ ok, errors, warnings }`. Errors short-circuit `ok=false`; v1 aliases OUTSIDE the block surface as warnings (not errors). |
| `src/cli/installSkills.ts` | Operator-facing CLI: `--skills-dir`, `--agent`, `--dry-run`, `--backup-dir`, `--json`. Default dry-run is the safe path. |
| `src/cli/verifyPhase3.ts` | Closure script: runs vitest, asserts Phase 3 artifacts exist, walks every fixture and runs the verifier, hashes fixtures before and after a dry-run of `installSkills` to confirm byte-idempotence. |
| `reports/phase3/verify-report.json` | The base schema from `rag-system/v2/design.md` §8 PLUS the Phase 3 metrics block: `metrics.dry_run_idempotent`, `metrics.fixtures_total`, `metrics.fixtures_expected_pass`, `metrics.fixtures_actual_pass`, `metrics.canonical_topic_key`, and a per-fixture `fixtures[]` array. |

## Required behavior

| Behavior | Evidence |
|----------|----------|
| Renderer is deterministic (no timestamps, no random IDs) | `test/skills/renderRagBlock.test.ts` |
| Patcher inserts a fresh block after the frontmatter on a clean file | `test/skills/patchSkill.test.ts` |
| Patcher is idempotent on a file that already carries the right block | `test/skills/patchSkill.test.ts` |
| Patcher replaces (not appends) when the `agent=` tag changes | `test/skills/patchSkill.test.ts` |
| Patcher refuses files without YAML frontmatter (soft error) | `test/skills/patchSkill.test.ts` |
| Verifier reports `ok: true` on a well-formed block and `ok: false` on a missing or wrong-topic block | `test/skills/verifySkill.test.ts` |
| Verifier treats v1 aliases INSIDE the block as errors and OUTSIDE as warnings | `test/skills/verifySkill.test.ts` |
| `installSkills` dry-run does NOT modify any file in `--skills-dir` | `test/cli/installSkills.test.ts` + `reports/phase3/verify-report.json` `metrics.dry_run_idempotent: true` |
| `installSkills` real run creates a restorable timestamped backup at `--backup-dir/<iso-ts>/<relpath>` | `test/cli/installSkills.test.ts` |
| `installSkills` is idempotent: a second run reports `unchanged` for every file | `test/cli/installSkills.test.ts` |
| `verify:phase3` writes the report even on failure (never short-circuits) | `test/cli/verifyPhase3.test.ts` |
| Live MCP is kept out of CI | `test/guardrails/noLiveMcpInTests.test.ts` |
| Every Phase 3 source file and fixture is reachable on disk | `test/cli/verifyPhase3.test.ts` asserts `metrics.artifacts_missing: []` |

## Workflow

```text
1. Make a change to Phase 3 code, fixtures, or docs.
2. Run `npm test`.
3. Run `npm run verify:phase1` (Phase 3 must not regress Phase 1).
4. Run `npm run verify:phase2` (Phase 3 must not regress Phase 2).
5. Run `npm run verify:phase3` (Phase 3 closure).
6. Open a PR. CI must run all four commands and pass green.
7. Merge only when `reports/phase3/verify-report.json` shows
   `exit_code: 0`, `tests_failed: 0`, `dry_run_idempotent: true`,
   `artifacts_missing: []`, and `fixtures_actual_pass ==
   fixtures_expected_pass`.
```

## Acceptance gates (from `rag-system/v2/design.md` §5)

| # | Gate | Closure evidence |
|---|------|------------------|
| G1 | A real SKILL.md in the repo carries the Engram RAG block. | `test/fixtures/skills/sdd-apply-patched.md` |
| G2 | The skill layer ships with unit tests. | `test/skills/{renderRagBlock,patchSkill,verifySkill}.test.ts` |
| G3 | `install-skills` does not write to disk when run as a dry-run. | `test/cli/installSkills.test.ts` end-to-end + `verify:phase3` hash check. |
| G4 | `verify:phase3` exits 0 with the report on disk. | `test/cli/verifyPhase3.test.ts` + `reports/phase3/verify-report.json` |
| G5 | CI runs the `verify:phase3` step before merge. | `.github/workflows/ci.yml` includes the step; `test/ci/workflow.test.ts` asserts it. |

## Relationship to Phase 1/2 lessons

Phase 3 keeps the `noLegacyTopicKeys` exception list minimal (the renderer body intentionally does not list forbidden v1 alias literals, so it stays off the exception list). It normalizes CRLF to LF inside `patchSkill` to keep the byte-for-byte idempotency check stable across Windows checkouts (`core.autocrlf=true`). It uses the same `run*Cli(argv) -> {exitCode, stdout, stderr}` pattern as Phase 1/2 so unit tests can drive the CLI in-process. The verify integration tests stay outside `npm test` to prevent nested Vitest execution in CI.
