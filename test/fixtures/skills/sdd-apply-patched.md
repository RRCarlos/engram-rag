---
name: sdd-apply
description: "Fixture for Phase 3 unit tests. This is what a SKILL.md looks like AFTER the patcher has run once. The RAG block is present and well-formed for sdd-apply with the canonical topic."
license: Apache-2.0
metadata:
  author: engram-rag-test
  version: "1.1"
---

## When to Use

Use this skill when the test wants to assert the patcher is IDEMPOTENT
on a file that already carries a correct RAG block — running patchSkill
a second time must report `changed: false` and the content must be
byte-identical.

<!-- ENGRAM_RAG_BLOCK_START agent=sdd-apply topic=engram-rag/agent-rigor-protocol/v2 -->

> **Engram RAG preflight (auto-generated)** — before any action on this
> skill, run:
>
> `engram-rag preflight --project engram-rag --agent sdd-apply --task-file <task> --json`
>
> Canonical topic: `engram-rag/agent-rigor-protocol/v2`. Any other
> topic key (including v1 aliases) is forbidden by policy.

<!-- ENGRAM_RAG_BLOCK_END -->

## Critical Rules

1. Running patchSkill a second time on this file must be a no-op.
2. The verifier must report `ok: true` with zero errors and zero
   warnings on this file.
3. The RAG block must be REPLACED in place, not appended, when the
   `agent` tag changes.
