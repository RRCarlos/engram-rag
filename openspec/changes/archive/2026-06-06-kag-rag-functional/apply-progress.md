# Apply Progress: KAG/RAG Functional First Slice

## Slice

- Change: `kag-rag-functional`
- Completed work units: Unit 1 — validated RAG contracts, fixture corpus, deterministic chunks; Unit 2 — lexical retrieval API with citation-ready JSON; Unit 3 — CLI parity and minimal eval coverage
- Delivery: stacked-to-main PR slices
- Current boundary: starts after contracts/fixtures/ingestion/chunking and retrieval API; ends with `src/cli/ragQuery.ts` exposing JSON-only CLI output plus `src/rag/ragEval.ts` minimal recall/citation eval assertions. All planned tasks are complete.

## Completed Tasks

- [x] 1.1 RED: Add `test/contracts/rag.test.ts` for valid/invalid queries, strict documents, chunks, citations, and responses.
- [x] 1.2 GREEN: Create `src/contracts/rag.ts` with strict Zod schemas and parse/safe-parse helpers.
- [x] 1.3 RED: Add fixture validation tests for `fixtures/corpus/*.json` preserving document ID, title, source path, and text.
- [x] 1.4 GREEN: Create small overlapping JSON fixtures under `fixtures/corpus/` for ranking, ties, and citations.
- [x] 1.5 REFACTOR: Align schema names and helper style with `src/contracts/*` without touching preflight contracts.
- [x] 2.1 RED: Add `test/rag/corpusLoader.test.ts` proving default/custom corpus directory loading and structured failure on invalid fixtures.
- [x] 2.2 GREEN: Create `src/rag/corpusLoader.ts` to read `fixtures/corpus/*.json` and validate documents.
- [x] 2.3 RED: Add `test/rag/chunker.test.ts` for stable IDs, order, text, document metadata, and citation locations across repeated runs.
- [x] 2.4 GREEN: Create `src/rag/chunker.ts` with deterministic chunk IDs from document ID plus chunk index.
- [x] 2.5 REFACTOR: Keep chunking pure and option-driven; remove duplicated metadata assembly.
- [x] 3.1 RED: Add `test/rag/retriever.test.ts` for top-k ordering, descending scores, stable tie-breaks, no-match empty results, and citation fields.
- [x] 3.2 GREEN: Create `src/rag/retriever.ts` with query normalization, lexical scoring, score/chunk-ID sort, snippets, and validated response output.
- [x] 3.3 RED: Add an in-process pipeline test for fixture load -> chunk -> retrieve JSON matching spec scenarios.
- [x] 3.4 GREEN: Export a callable API boundary from `src/rag/retriever.ts` returning `RagRetrievalResponse` only.
- [x] 3.5 REFACTOR: Ensure no embeddings, prompts, generated answers, graph fields, or `KnowledgeRecord` coupling leak into RAG output.
- [x] 4.1 RED: Add `test/cli/ragQuery.test.ts` running `node --import tsx src/cli/ragQuery.ts --query ... --top-k ...` and parsing stdout JSON.
- [x] 4.2 GREEN: Create `src/cli/ragQuery.ts` with `--query`, optional `--top-k`/`--corpus-dir`, validation errors, and JSON-only stdout.
- [x] 4.3 RED: Add `test/rag/ragEval.test.ts` for recall and citation-ready fields.
- [x] 4.4 GREEN: Implement minimal eval assertions without changing existing phase verify scripts.
- [x] 4.5 REFACTOR: Run `npm test` and `npx tsc --noEmit`; keep existing preflight tests unchanged.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `test/contracts/rag.test.ts` | Unit | N/A (new) | ✅ Failed before `src/contracts/rag.ts` existed | ✅ `6/6` passed after contract implementation | ✅ Valid query, invalid query, strict document, chunk citation, response, structured failure cases | ✅ Helper style mirrors existing contract parse/safe-parse pattern |
| 1.2 | `test/contracts/rag.test.ts` | Unit | N/A (new) | ✅ Contract tests written first | ✅ `6/6` passed with strict Zod schemas | ✅ Multiple schemas exercised with accept/reject paths | ✅ Shared Zod error formatting extracted |
| 1.3 | `test/fixtures/ragCorpus.test.ts` | Unit | N/A (new) | ✅ Failed before `fixtures/corpus/*.json` existed | ✅ `3/3` fixture tests passed | ✅ `alpha`, `beta`, and `gamma` fixtures validated | ➖ None needed |
| 1.4 | `test/fixtures/ragCorpus.test.ts` | Unit | N/A (new) | ✅ Fixture tests written first | ✅ `3/3` passed after fixture creation | ✅ Three overlapping documents cover ranking/tie/citation data for later slices | ➖ None needed |
| 1.5 | `test/contracts/rag.test.ts` | Unit | N/A (new) | ✅ Existing RED suite constrained helper names/style | ✅ Contract suite stayed green | ✅ Strict extra-property and structured-error cases prevent drift | ✅ No preflight contracts touched |
| 2.1 | `test/rag/corpusLoader.test.ts` | Unit | N/A (new) | ✅ Failed before `src/rag/corpusLoader.ts` existed | ✅ `3/3` loader tests passed | ✅ Default load, custom directory, invalid fixture failure | ➖ None needed |
| 2.2 | `test/rag/corpusLoader.test.ts` | Unit | N/A (new) | ✅ Loader tests written first | ✅ `3/3` passed with deterministic read/validation | ✅ Success and structured failure paths covered | ✅ Sorting and safe wrapper kept focused |
| 2.3 | `test/rag/chunker.test.ts` | Unit | N/A (new) | ✅ Failed before `src/rag/chunker.ts` existed | ✅ `3/3` chunker tests passed | ✅ Repeated-run stability, metadata/citations, and chunk-size behavior | ➖ None needed |
| 2.4 | `test/rag/chunker.test.ts` | Unit | N/A (new) | ✅ Chunker tests written first | ✅ `3/3` passed with deterministic IDs | ✅ Default metadata and option-driven sizing covered | ✅ Chunk creation validates output through contract parser |
| 2.5 | `test/rag/chunker.test.ts` | Unit | N/A (new) | ✅ Option-driven/purity tests written first | ✅ `3/3` passed after chunker extraction | ✅ Different `maxCharacters` inputs force non-hardcoded logic | ✅ Metadata assembly centralized in `createChunk` |
| 3.1 | `test/rag/retriever.test.ts` | Unit | N/A (new) | ✅ `npm test -- test/rag/retriever.test.ts test/rag/retrieverPipeline.test.ts` failed because `src/rag/retriever.ts` did not exist | ✅ `3/3` retriever tests passed after implementation | ✅ Top-k scoring, score ties, no-match empty results, and citation fields covered | ✅ Lexical scoring and tie-break logic kept pure and deterministic |
| 3.2 | `test/rag/retriever.test.ts` | Unit | N/A (new) | ✅ Retriever tests written before production code | ✅ `3/3` passed with query normalization, lexical score, score/chunk-ID sort, snippets, and validated response | ✅ Different queries force non-hardcoded ranking, tie ordering, and empty result paths | ✅ Response is validated through `parseRagRetrievalResponse` |
| 3.3 | `test/rag/retrieverPipeline.test.ts` | Integration | N/A (new) | ✅ Pipeline test failed before retriever API existed | ✅ `1/1` pipeline test passed after retrieval API implementation | ✅ Fixture load -> chunk -> retrieve covers citation-ready JSON and descending scores | ➖ None needed |
| 3.4 | `test/rag/retriever.test.ts`, `test/rag/retrieverPipeline.test.ts` | Unit/Integration | N/A (new) | ✅ Tests imported `retrieveChunks` from the callable API boundary before it existed | ✅ `4/4` Phase 3 tests passed with `retrieveChunks` returning `RagRetrievalResponse` | ✅ Unit and integration callers both exercise the same API boundary | ✅ API remains isolated in `src/rag/retriever.ts` |
| 3.5 | `test/rag/retriever.test.ts`, `test/rag/retrieverPipeline.test.ts` | Unit/Integration | N/A (new) | ✅ Tests asserted absence of `answer`, `prompt`, `stream`, `embeddings`, and `graph` output fields | ✅ `4/4` Phase 3 tests passed; full `npm test` passed | ✅ Empty and non-empty outputs both validate no generated-answer or graph leakage | ✅ No `KnowledgeRecord` imports or existing preflight retrieval files touched |
| 4.1 | `test/cli/ragQuery.test.ts` | CLI/Integration | N/A (new) | ✅ `npm test -- test/cli/ragQuery.test.ts test/rag/ragEval.test.ts` failed because `src/cli/ragQuery.ts` did not exist | ✅ `3/3` CLI tests passed after implementation | ✅ API equivalence, custom corpus directory, and validation-error paths covered | ✅ CLI emits JSON-only stdout and stderr-only validation failures |
| 4.2 | `test/cli/ragQuery.test.ts` | CLI/Integration | N/A (new) | ✅ CLI tests written before production CLI | ✅ `3/3` passed with `--query`, `--top-k`, and `--corpus-dir` handling | ✅ Default corpus and custom corpus force real loader/chunker/retriever path | ✅ Fixed exact-optional TypeScript issue in `--corpus-dir` parsing |
| 4.3 | `test/rag/ragEval.test.ts` | Unit | N/A (new) | ✅ RED failed because `src/rag/ragEval.ts` did not exist | ✅ `2/2` eval tests passed after implementation | ✅ Passing recall scenario and failing missing-recall scenario covered | ✅ Eval report excludes generated answers, prompts, and graph fields |
| 4.4 | `test/rag/ragEval.test.ts` | Unit | N/A (new) | ✅ Eval assertions written first | ✅ `2/2` passed with minimal scenario evaluator | ✅ Recall, missing IDs, matched IDs, and citation summaries covered | ✅ No existing phase verify scripts changed |
| 4.5 | RAG slice tests + full suite | Regression | ✅ Previous full suite passed before this slice in prior apply progress | ✅ Final slice tests failed before CLI/eval implementation | ✅ RAG slice `24/24` passed; full `npm test` passed `39` files / `464` tests / `1` skipped | ✅ Cumulative RAG tests cover contracts, fixtures, loader, chunker, retrieval, CLI, and eval | ✅ `npx tsc --noEmit` rerun; only pre-existing non-RAG strictness errors remain |

## Test Summary

- Previous RED command: `npm test -- test/contracts/rag.test.ts test/fixtures/ragCorpus.test.ts test/rag/corpusLoader.test.ts test/rag/chunker.test.ts` — failed because new production files/fixtures did not exist.
- Previous slice command: `npm test -- test/contracts/rag.test.ts test/fixtures/ragCorpus.test.ts test/rag/corpusLoader.test.ts test/rag/chunker.test.ts` — 4 files, 15 tests passed.
- Phase 3 RED command: `npm test -- test/rag/retriever.test.ts test/rag/retrieverPipeline.test.ts` — failed because `src/rag/retriever.ts` did not exist.
- Phase 3 GREEN command: `npm test -- test/rag/retriever.test.ts test/rag/retrieverPipeline.test.ts` — 2 files, 4 tests passed.
- Phase 4 RED command: `npm test -- test/cli/ragQuery.test.ts test/rag/ragEval.test.ts` — failed because `src/cli/ragQuery.ts` and `src/rag/ragEval.ts` did not exist.
- Phase 4 GREEN command: `npm test -- test/cli/ragQuery.test.ts test/rag/ragEval.test.ts` — 2 files, 5 tests passed.
- Cumulative RAG command: `npm test -- test/contracts/rag.test.ts test/fixtures/ragCorpus.test.ts test/rag/corpusLoader.test.ts test/rag/chunker.test.ts test/rag/retriever.test.ts test/rag/retrieverPipeline.test.ts test/cli/ragQuery.test.ts test/rag/ragEval.test.ts` — 8 files, 24 tests passed.
- Full test command: `npm test` — 39 files passed, 464 tests passed, 1 skipped.
- Type check: `npx tsc --noEmit` — failed on pre-existing strictness errors outside this slice after fixing the only new RAG CLI error. Remaining files: `src/cli/eval.ts`, `src/cli/preflight.ts`, `src/cli/preflightLive.ts`, `src/eval/runScenario.ts`, `src/retrieval/retrievalPlan.ts`, `src/skills/verifySkill.ts`, `test/engram/fakeEngramAdapter.test.ts`, and `test/retrieval/retrievalPlan.test.ts`.

## Remaining Tasks

None — all 20 tasks are complete.

## Deviations

None — implementation matches the design boundary for deterministic lexical retrieval, citation-ready API/CLI JSON output, and minimal eval assertions without generated answers or graph fields.

## Issues

- `tasks.md` still records workload forecast metadata with `Chain strategy: pending`, but the launch context explicitly resolved delivery to `stacked-to-main`; this slice followed the resolved launch context without rewriting forecast metadata.
- Live preflight for `--shell powershell` can report missing expected record `powershell`; rerunning live preflight without `--shell` returned complete, non-degraded context.
- `npx tsc --noEmit` still fails on pre-existing strictness errors outside this RAG slice.
