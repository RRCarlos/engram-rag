# Tasks: RAG Semantic + Graph Retrieval with Lexical Fusion

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~700-1000 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (contracts+embedder+vector) -> PR 2 (graph+hybrid) -> PR 3 (CLI+eval) |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| PR 1 | Contracts + Embedder + VectorIndex + semantic retriever | base: main | Add `.rag/` to `.gitignore`; tests under `test/contracts/`, `test/rag/embedder/`, `test/rag/vectorIndex/` |
| PR 2 | GraphIndex + HybridRetriever (RRF) | base: main | Stacked after PR 1; tests under `test/rag/graphIndex/`, `test/rag/hybridRetriever.test.ts` |
| PR 3 | CLI flags + eval + close-out | base: main | Stacked after PR 2; extends `test/cli/ragQuery.test.ts` and `test/rag/ragEval.test.ts` |

## PR 1: Contracts + Embedder + VectorIndex + Semantic Retriever

- [ ] 1.1 RED: add failing tests in `test/contracts/rag.test.ts` for `EmbedderIdSchema`, `RetrievalModeSchema`, `RagSignalsSchema`, optional `signals` on `RagRetrievalResultSchema`.
- [ ] 1.2 GREEN: extend `src/contracts/rag.ts` with the new Zod schemas; preserve existing `RagRetrievalResponse` shape.
- [ ] 1.3 RED: add `test/rag/embedder/embedder.test.ts` (contract) and `test/rag/embedder/hashingEmbedder.test.ts` (determinism, length, L2 norm).
- [ ] 1.4 GREEN: implement `src/rag/embedder/embedder.ts` (interface) and `src/rag/embedder/hashingEmbedder.ts` (FNV-1a, L2-normalized, default `dimensions = 64`).
- [ ] 1.5 REFACTOR: extract `src/rag/embedder/registry.ts` with `register`/`resolve`; reject duplicate ids.
- [ ] 1.6 RED: add `test/rag/vectorIndex/cosine.test.ts` and `store.test.ts` (cosine math, top-k, JSON cache round-trip).
- [ ] 1.7 GREEN: implement `src/rag/vectorIndex/cosine.ts` and `src/rag/vectorIndex/store.ts` (`.rag/vector/<corpusHash>.json`).
- [ ] 1.8 RED: add `test/rag/semanticRetriever.test.ts` for cosine top-k and lexical fallback when index empty.
- [ ] 1.9 GREEN: implement `src/rag/semanticRetriever.ts` consuming the hashing embedder.
- [ ] 1.10 Update `.gitignore` with `.rag/` and run `npm test` + `npx tsc --noEmit` green.

## PR 2: GraphIndex + HybridRetriever (RRF)

- [x] 2.1 RED: add `test/rag/graphIndex/extract.test.ts` (regex dedup, sort, determinism) and `traverse.test.ts` (1-hop, edge cap = 8).
- [x] 2.2 GREEN: implement `src/rag/graphIndex/extract.ts`, `src/rag/graphIndex/store.ts`, `src/rag/graphIndex/traverse.ts`.
- [x] 2.3 RED: add `test/rag/hybridRetriever.test.ts` covering RRF `k=60` (table-driven) and graceful absence of one signal.
- [x] 2.4 GREEN: implement `src/rag/hybridRetriever.ts` with `retrieveHybrid({ mode })` dispatch and optional `signals` block.
- [x] 2.5 Extend `test/rag/retrieverPipeline.test.ts` with `mode: "hybrid"` asserting citation fields and `signals.fused`.
- [x] 2.6 REFACTOR: hoist RRF helper to `src/rag/rrf.ts`; ensure `npm test` and `npx tsc --noEmit` stay green.

## PR 3: CLI + Eval + Close-out

- [ ] 3.1 RED: extend `test/cli/ragQuery.test.ts` with `--mode lexical|semantic|graph|hybrid` and `--embedder hashing|<id>` cases (subprocess).
- [ ] 3.2 GREEN: update `src/cli/ragQuery.ts` to accept the new flags; default `mode = lexical`; emit `signals` only when non-lexical.
- [ ] 3.3 RED: add `test/rag/ragEval.test.ts` cases for hybrid recall/citation; add `eval/rag-scenarios/hybrid.json`.
- [ ] 3.4 GREEN: implement `test/rag/ragEval.test.ts` and `eval/rag-scenarios/hybrid.json`; assert fused `score` equals top-level `score`.
- [ ] 3.5 REFACTOR: unify CLI option parsing helper; run full `npm test` and `npx tsc --noEmit`; confirm archived kag-rag slice remains green.
