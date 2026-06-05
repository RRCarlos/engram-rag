---
name: sdd-apply
description: "Fixture for Phase 3 unit tests. Mirrors a real OpenCode skill shape: YAML frontmatter, blank line, then markdown. The RAG block is NOT present in this fixture on purpose, so the patcher must insert it on the first run."
license: Apache-2.0
metadata:
  author: engram-rag-test
  version: "1.0"
---

## When to Use

Use this skill when the test wants to assert the patcher INSERT a new
RAG block after the frontmatter on a file that has none.

## Critical Rules

1. The patcher must locate the frontmatter end and insert the block
   immediately after it.
2. The block must use the canonical topic key.
3. The block must include the preflight command line.

## Notes

The body below the frontmatter is intentionally short and free of
anything that could collide with the `<!-- ENGRAM_RAG_BLOCK_START -->`
delimiters the patcher uses.

## More Body

- Item one
- Item two
- Item three
