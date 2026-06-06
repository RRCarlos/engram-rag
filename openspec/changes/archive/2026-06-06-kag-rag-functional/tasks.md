# Tasks: KAG/RAG Functional First Slice

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 650-900 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 contracts/fixtures/ingestion → PR 2 retrieval API → PR 3 CLI/eval polish |
| Delivery strategy | auto-chain |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Validated RAG contracts, fixture corpus, deterministic chunks | PR 1 | Includes contract/loader/chunker RED-GREEN-REFACTOR tests. |
| 2 | Lexical retrieval API with citation-ready JSON | PR 2 | Depends on PR 1; includes ranking/tie/no-match tests. |
| 3 | CLI parity and minimal eval coverage | PR 3 | Depends on PR 2; includes CLI/API equivalence tests. |

## Phase 1: Contracts and Fixtures

- [x] 1.1 RED: Add `test/contracts/rag.test.ts` for valid/invalid queries, strict documents, chunks, citations, and responses.
- [x] 1.2 GREEN: Create `src/contracts/rag.ts` with strict Zod schemas and parse/safe-parse helpers.
- [x] 1.3 RED: Add fixture validation tests for `fixtures/corpus/*.json` preserving document ID, title, source path, and text.
- [x] 1.4 GREEN: Create small overlapping JSON fixtures under `fixtures/corpus/` for ranking, ties, and citations.
- [x] 1.5 REFACTOR: Align schema names and helper style with `src/contracts/*` without touching preflight contracts.

## Phase 2: Ingestion and Chunking

- [x] 2.1 RED: Add `test/rag/corpusLoader.test.ts` proving default/custom corpus directory loading and structured failure on invalid fixtures.
- [x] 2.2 GREEN: Create `src/rag/corpusLoader.ts` to read `fixtures/corpus/*.json` and validate documents.
- [x] 2.3 RED: Add `test/rag/chunker.test.ts` for stable IDs, order, text, document metadata, and citation locations across repeated runs.
- [x] 2.4 GREEN: Create `src/rag/chunker.ts` with deterministic chunk IDs from document ID plus chunk index.
- [x] 2.5 REFACTOR: Keep chunking pure and option-driven; remove duplicated metadata assembly.

## Phase 3: Retrieval API

- [x] 3.1 RED: Add `test/rag/retriever.test.ts` for top-k ordering, descending scores, stable tie-breaks, no-match empty results, and citation fields.
- [x] 3.2 GREEN: Create `src/rag/retriever.ts` with query normalization, lexical scoring, score/chunk-ID sort, snippets, and validated response output.
- [x] 3.3 RED: Add an in-process pipeline test for fixture load -> chunk -> retrieve JSON matching spec scenarios.
- [x] 3.4 GREEN: Export a callable API boundary from `src/rag/retriever.ts` or `src/rag/index.ts` returning `RagRetrievalResponse` only.
- [x] 3.5 REFACTOR: Ensure no embeddings, prompts, generated answers, graph fields, or `KnowledgeRecord` coupling leak into RAG output.

## Phase 4: CLI and Verification

- [x] 4.1 RED: Add `test/cli/ragQuery.test.ts` running `node --import tsx src/cli/ragQuery.ts --query ... --top-k ...` and parsing stdout JSON.
- [x] 4.2 GREEN: Create `src/cli/ragQuery.ts` with `--query`, optional `--top-k`/`--corpus-dir`, validation errors, and JSON-only stdout.
- [x] 4.3 RED: Add `test/rag/ragEval.test.ts` or `eval/rag-scenarios/*.json` for recall and citation-ready fields.
- [x] 4.4 GREEN: Implement minimal eval assertions without changing existing phase verify scripts.
- [x] 4.5 REFACTOR: Run `npm test` and `npx tsc --noEmit`; keep existing preflight tests unchanged.
