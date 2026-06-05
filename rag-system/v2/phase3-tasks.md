---
title: "Engram RAG v2 — Phase 3 task plan (skill integration verificable)"
version: "2.0"
status: "archived"
date: "2026-06-05"
project: "engram-rag"
artifact: "phase3-tasks"
parent_design: "rag-system/v2/design.md"
canonical_topic_key: "engram-rag/agent-rigor-protocol/v2"
closed_at: "2026-06-05"
closed_by: "PRs #8 (foundation), #9 (runtime), #10 (closure); main f6568b1"
---

# Phase 3 task plan

## Goal

Make target agents run Engram preflight before acting, by patching their
SKILL.md files in a **dry-run-first, idempotent, rollback-friendly** way.
The output of this phase is a working `engram-rag install-skills` CLI plus
a verifier the CI can run on a real or fixture skill directory.

This phase is the last "infrastructure" phase before evaluation (Phase 4)
and the real API + dashboard (Phase 5). The output of `install-skills` must
be safe to run against the user's real
`C:\Users\PC\.config\opencode\skills\` tree without leaking v1 aliases,
without duplicating blocks on re-runs, and with a recoverable backup
when the user opts into a non-dry-run.

## Scope (from `rag-system/v2/design.md` § 5)

| Path | Type | Responsibility |
|------|------|----------------|
| `src/skills/renderRagBlock.ts` | Create | Generate the RAG block from contracts. |
| `src/skills/patchSkill.ts` | Create | Insert or update the block after frontmatter. |
| `src/skills/verifySkill.ts` | Create | Verify structure, topic key, no duplication. |
| `src/cli/installSkills.ts` | Create | `--dry-run`, `--skills-dir`, `--backup-dir`, `--json`. |
| `src/cli/verifyPhase3.ts` | Create | Generate `reports/phase3/verify-report.json`. |
| `test/fixtures/skills/*.md` | Create | Synthetic skills with realistic frontmatter. |
| `test/skills/*.test.ts` | Create | Insertion, update, idempotency, rollback. |
| `test/cli/installSkills.test.ts` | Create | CLI exit codes, dry-run side effects, backup creation. |
| `test/cli/verifyPhase3.test.ts` | Create | Excluded from default `npm test` like the other verify CLIs. |
| `docs/phase3-acceptance.md` | Create | Acceptance gates for closure. |
| `reports/phase3/` | Create | Untracked, holds `verify-report.json` per run. |

## Contracts

| Contract | Signature | Notes |
|----------|-----------|-------|
| Render | `renderRagBlock(agentId: AgentId): string` | Pure function. Includes the canonical topic key literally. |
| Patch | `patchSkill(content: string, agentId: AgentId): PatchResult` | `PatchResult = { content: string; changed: boolean; reason: string }`. Pure (no I/O). |
| Verify | `verifySkill(content: string, agentId: AgentId): SkillVerification` | `SkillVerification = { ok: boolean; errors: string[]; warnings: string[] }`. Pure. |
| CLI install | `engram-rag install-skills --skills-dir <path> [--dry-run] [--backup-dir <path>] --json` | Walks the dir, applies patchSkill per file, writes backups on real runs. |
| CLI verify | `engram-rag verify-phase3` | Loads every `SKILL.md` in `test/fixtures/skills/`, runs `verifySkill` on each, writes `reports/phase3/verify-report.json`. |

## Block format

The RAG block is delimited by HTML comments so the patcher can locate it
deterministically. Example for `sdd-apply`:

```markdown
<!-- ENGRAM_RAG_BLOCK_START agent=sdd-apply topic=engram-rag/agent-rigor-protocol/v2 -->

> **Engram RAG preflight (auto-generated)** — before any action on this
> skill, run:
>
> `engram-rag preflight --project engram-rag --agent sdd-apply --task-file <task> --json`
>
> Canonical topic: `engram-rag/agent-rigor-protocol/v2`. v1 aliases
> (`protocol/rigor`, `pattern/agent-rigor-protocol`,
> `sdd/engram-rag-fase-2/*`) are forbidden by policy.

<!-- ENGRAM_RAG_BLOCK_END -->
```

- The `agent=` and `topic=` tags in `START` are the structural anchor.
- The blockquote makes the block visible in rendered markdown.
- `ENGRAM_RAG_BLOCK_END` has no metadata, so a stray change to the tags
  in `START` is caught by the verifier.

## Chained PR plan

This phase is forecast at ~900–1100 changed lines (3 modules + 1 CLI +
1 verify script + ~6 fixtures + ~5 test files + 1 acceptance doc + CI
update). That is over the 400-line D1 budget, so the work is split into
**three chained stacked-to-main PRs** consistent with the Phase 2
pattern and the persistent `rag-system/v2/PREFLIGHT.md`.

### PR-A — Foundation (this plan + modules + unit tests)

Files:

- `rag-system/v2/phase3-tasks.md` (this file)
- `src/skills/renderRagBlock.ts`
- `src/skills/patchSkill.ts`
- `src/skills/verifySkill.ts`
- `src/skills/types.ts` (shared Zod schemas for `PatchResult` and `SkillVerification`)
- `test/fixtures/skills/sdd-apply-clean.md`
- `test/fixtures/skills/sdd-apply-patched.md`
- `test/fixtures/skills/no-frontmatter.md`
- `test/fixtures/skills/wrong-topic.md`
- `test/skills/renderRagBlock.test.ts`
- `test/skills/patchSkill.test.ts`
- `test/skills/verifySkill.test.ts`
- `test/skills/skillTypes.test.ts` (Zod round-trips for the shared types)

Forecast: ~600–700 lines. Slightly over D1, accepted under D2
(800 lines, the persistent preflight default) because the foundation
ships as a coherent unit (the render/patch/verify trio cannot be split
meaningfully without leaving half of any module untested).

Acceptance:

- `npm test` passes 215 (current) + ~30 new tests = ~245.
- `verify:phase3` is added in PR-B, not this PR.

### PR-B — Runtime (CLI + integration tests + verify script)

Files:

- `src/cli/installSkills.ts`
- `src/cli/verifyPhase3.ts`
- `test/cli/installSkills.test.ts`
- `test/cli/verifyPhase3.test.ts` (excluded from default `npm test`)
- `package.json` script additions: `verify:phase3`, update `test:verify`
  to include `verifyPhase3`.

Forecast: ~400–500 lines.

Acceptance:

- `npm test` passes 245 + ~12 = ~257.
- `npm run verify:phase3` exits 0 and writes a valid
  `reports/phase3/verify-report.json`.

### PR-C — Closure (acceptance doc + CI gate)

Files:

- `docs/phase3-acceptance.md`
- `test/docs/phase3-acceptance.test.ts`
- `reports/phase3/.gitkeep`
- `.github/workflows/ci.yml` (add `npm run verify:phase3` step)

Forecast: ~150–200 lines.

Acceptance:

- CI runs `npm test`, `verify:phase1`, `verify:phase2`, **and**
  `verify:phase3`; all four steps green on the merge commit.
- `docs/phase3-acceptance.md` lists the five acceptance gates from
  `design.md` and `docs/` test confirms the file is present and
  references each gate.

## Acceptance gates (rolled up from `design.md` § 5)

| Gate | Evidence | Verified in |
|------|----------|-------------|
| Block inserted after frontmatter | Patch test on `sdd-apply-clean.md` | PR-A |
| Second run is idempotent | Patch test running twice yields identical content | PR-A |
| Block uses canonical topic key only | Verifier rejects any v1 alias in the block; `noLegacyTopicKeys` guardrail still passes on patched fixtures | PR-A |
| Dry-run does not write files | CLI integration test compares file checksums before/after | PR-B |
| Rollback restores original content | CLI integration test in temp dir with backup, then restore, then diff | PR-B |
| CI runs the verify gate | Workflow file references `verify:phase3` and is tested | PR-C |

## Dependencies

- Phase 1 (knowledge contract + retrieval planner): provides the
  `AgentId` type and canonical topic key constant consumed by
  `renderRagBlock`.
- Phase 2 (Engram preflight adapter): the block text references
  `engram-rag preflight ... --json`, but the patcher does not call the
  preflight itself, so the dependency is textual, not behavioural.
- Node 20 stdlib only (no new dependencies — see
  `rag-system/v2/design.md` stack note).

## Risks and rollbacks

| Risk | Mitigation | Rollback |
|------|-----------|----------|
| Patcher writes to user's real `C:\Users\PC\.config\opencode\skills` | CLI defaults to `--dry-run`; only writes when the flag is absent AND a `--skills-dir` is given. Tests use temp dirs only. | Re-run `install-skills` against a backup; the verifier will flag anything that drifted. |
| Markdown with non-standard frontmatter (no `---` close, or weird `---` inside) | `patchSkill` returns `{ changed: false, reason: "no frontmatter" }`; verifier reports it as a soft error. | No write happens, no rollback needed. |
| Fixture drift between Phase 3 and Phase 4 evaluation | Fixtures are versioned in this file; tests assert exact content shape. | Re-run PR-A tests to surface any drift. |
| v1 alias sneaks into a block | Verifier rejects, `noLegacyTopicKeys` guardrail rejects, `patchSkill` rewrite is the only writer so the surface is small. | Manual fix in the offending fixture or CLI invocation. |
| `verify:phase3` recursion (same trap as Phase 1/2 verify CLIs) | `test/cli/verifyPhase3.test.ts` excluded from default `npm test` via the same quoted glob already in `package.json` (`--exclude "test/cli/verifyPhase*.test.ts"`). | N/A — exclusion is in place from PR-B's first commit. |

## Out of scope (Phase 4 and 5)

- The evaluation harness that scores retrieval against known failures
  (Phase 4) is built on top of the preflight from Phase 2, not the
  patcher from Phase 3. Phase 3 is about getting the block to the
  agent's SKILL.md, not measuring what the agent does with it.
- The real API + dashboard (Phase 5) consumes the same canonical topic
  key contract but does not depend on the patcher.
