---
name: sdd-apply
description: "Fixture for Phase 3 unit tests. The RAG block is present but the topic tag is a forbidden v1 alias, not the canonical key. The verifier must fail this with a clear error."
license: Apache-2.0
metadata:
  author: engram-rag-test
  version: "1.0"
---

## When to Use

This fixture simulates a skill that was hand-edited (or written by a
stale v1 tool) and has a RAG block that points at a forbidden topic
alias. The patcher is NOT expected to fix this on its own; the
verifier must catch it and report an actionable error.

<!-- ENGRAM_RAG_BLOCK_START agent=sdd-apply topic=protocol/rigor/v1 -->

> This block uses a v1 alias intentionally so the verifier rejects it.

<!-- ENGRAM_RAG_BLOCK_END -->

## Body

- Item
