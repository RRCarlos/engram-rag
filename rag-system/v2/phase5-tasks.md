---
title: "Engram RAG v2 — Phase 5 task plan"
version: "1.0"
status: "in-progress"
date: "2026-06-05"
project: "engram-rag"
artifact: "phase5-tasks"
parent_design: "rag-system/v2/design.md"
canonical_topic_key: "engram-rag/agent-rigor-protocol/v2"
---

# Phase 5 task plan

## Goal

Connect the deterministic RAG contract to live Engram paths without making CI
depend on live user configuration. Fake remains the CI default; live behavior is
explicit and operator-triggered.

## PR slices

| Slice | Status | Scope | Evidence |
|-------|--------|-------|----------|
| 5-A | Merged | Live Engram HTTP adapter. | PR #16 / `873025d` |
| 5-B | Merged | `preflightLive` CLI and explicit `eval --adapter live`. | PR #17 / `f98c6a4` |
| 5-C | In progress | Idempotent repo CLI for patching copied SDD skills with live preflight instructions. | `src/cli/patchLiveSkills.ts`, `test/cli/patchLiveSkills.test.ts` |

## 5-C acceptance

- Patch only a caller-provided skill directory; tests use temporary directories.
- Find `sdd-*/SKILL.md` files and ignore non-SDD skills.
- Insert or replace a marked English live preflight block idempotently.
- Support `--dry-run` without writing files.
- Use `pathToFileURL(process.argv[1]).href` for the direct-invoke guard.
- Do not patch the user's real live skill directory during implementation or CI.

## Closure status

Phase 5 is not closed yet. 5-C can be verified with:

```bash
npm test -- patchLiveSkills
npm test
```
