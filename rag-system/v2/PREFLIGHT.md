---
title: "Engram RAG v2 - Orchestration Preflight Decisions"
version: "1.0"
status: "active"
date: "2026-06-05"
project: "engram-rag"
artifact: "preflight-decisions"
language: "en"
canonical_topic_key: "engram-rag/agent-rigor-protocol/v2"
---

# Engram RAG v2 - Orchestration Preflight Decisions

This file is the persistent orchestration source of truth for future v2 phases.
Do not ask the user for the same preflight decisions again unless scope, risk, or
delivery strategy materially changes.

## Default decisions for v2 phases

| Decision | Value |
|---|---|
| Execution mode | `auto` |
| Artifact store | `openspec` / file-based artifacts in repo |
| Default artifact paths | `rag-system/v2/`, `reports/phase{N}/` |
| Review budget | 400 changed lines per PR, excluding lockfiles |
| Commit style | Conventional commits, English, no AI attribution |
| Default review strategy | Single PR if forecast <= 400 lines |
| Chained PR strategy | `stacked-to-main` when forecast exceeds budget |

## Phase-specific decisions

### Phase 1

| Field | Value |
|---|---|
| Delivery | Single PR |
| PR | https://github.com/RRCarlos/engram-rag/pull/1 |
| Status | Archived |
| Verification | PASS WITH WARNINGS, 0 critical |

### Phase 2

| Field | Value |
|---|---|
| Delivery | Chained PRs |
| Chain strategy | `stacked-to-main` |
| Reason | Forecast 950-1050 lines exceeds 400-line budget |
| PR-A | `v2-phase2-foundation`: P2-01, P2-02, P2-06 |
| PR-B | `v2-phase2-runtime`: P2-03, P2-04, P2-05 |
| PR-C | `v2-phase2-closure`: P2-07 |

## Standing implementation constraints

- Do not use Windows-only `cmd.exe /c` wrappers. Use platform-agnostic code such
  as Node `shell: true` when a shell is required.
- Do not add dependencies unless a task explicitly justifies them.
- Fake adapters are the primary CI target; live MCP calls are local smoke only.
- For Engram preflight, call order is strict: `mem_context` -> `mem_search` ->
  `mem_get_observation`.
- Degraded mode is first-class: unavailable Engram must not block the agent.
- Every phase closes with `npm test`, `npm run verify:phase{N}`, and a generated
  `reports/phase{N}/verify-report.json`.
- CI must be green on GitHub Actions before merging each PR.

## Delegation policy for this project

- The orchestrator should implement small and medium mechanical tasks directly.
- Delegate only broad exploration, complex multi-file implementation, or fresh
  adversarial review where independent context adds value.
- Do not ask the user to repeat stored preflight choices after each phase.
