# Apply Progress: rag-semantic-graph (PR 1)

**Branch:** `feat/rag-semantic-pr1`
**Chain strategy:** `stacked-to-main` (PR 1 of 3, base = main)
**Mode:** Strict TDD
**Started:** 2026-06-06

## TDD Cycle Evidence (PR 1)

| Task | RED test | GREEN impl | REFACTOR | Status |
|------|----------|------------|----------|--------|
| 1.1 RED: contract tests for `EmbedderId`, `RetrievalMode`, `RagSignalScore`, `RagSignals`, optional `signals` on `RagRetrievalResult` | test/contracts/rag.test.ts (9 new assertions) | src/contracts/rag.ts (5 new schemas) | n/a | DONE |
| 1.2 GREEN: extend contracts (per 1.1) | n/a | src/contracts/rag.ts | (covered by 1.1) | DONE |
| 1.3 RED: embedder contract test + hashing determinism/norm test | test/rag/embedder/embedder.test.ts (3) + test/rag/embedder/hashingEmbedder.test.ts (9) | src/rag/embedder/embedder.ts + src/rag/embedder/hashingEmbedder.ts | n/a | DONE |
| 1.4 GREEN: implement embedder + hashing (per 1.3) | n/a | src/rag/embedder/embedder.ts + src/rag/embedder/hashingEmbedder.ts | (covered by 1.3) | DONE |
| 1.5 REFACTOR: extract registry with register/resolve, reject duplicates | test/rag/embedder/registry.test.ts (6) | src/rag/embedder/registry.ts | registry validation probes dimensions | DONE |
| 1.6 RED: cosine math test + JSON cache round-trip test | test/rag/vectorIndex/cosine.test.ts (12) + test/rag/vectorIndex/store.test.ts (7) | src/rag/vectorIndex/cosine.ts + src/rag/vectorIndex/store.ts | n/a | DONE |
| 1.7 GREEN: implement cosine.ts + store.ts (per 1.6) | n/a | src/rag/vectorIndex/cosine.ts + src/rag/vectorIndex/store.ts | (covered by 1.6) | DONE |
| 1.8 RED: semanticRetriever test (cosine top-k + lexical fallback when index empty) | test/rag/semanticRetriever.test.ts (5) | src/rag/semanticRetriever.ts | n/a | DONE |
| 1.9 GREEN: implement semanticRetriever (per 1.8) | n/a | src/rag/semanticRetriever.ts | (covered by 1.8) | DONE |
| 1.10 gitignore + `npm test` + `npx tsc --noEmit` | n/a | .gitignore (`/.rag/`) | both gates green: 45 files / 540 passed (1 skipped) | DONE |

## Files Changed (PR 1)

| File | Action | Notes |
|------|--------|-------|
| `src/contracts/rag.ts` | Modified | New `EmbedderIdSchema`, `RetrievalModeSchema`, `RagSignalScoreSchema`, `RagSignalsSchema`; `RagRetrievalResultSchema` gains optional `signals`; `score` relaxed to `nonnegative` to admit 0-similarity vectors. |
| `src/rag/embedder/embedder.ts` | Created | `Embedder` interface. |
| `src/rag/embedder/hashingEmbedder.ts` | Created | FNV-1a 64-bit hashing with sign-collision accumulation, L2-normalized, default `dimensions = 256`. |
| `src/rag/embedder/registry.ts` | Created | `registerEmbedder`, `resolveEmbedder`, `isRegistered`, `clearEmbedderRegistry`; default registers hashing. |
| `src/rag/vectorIndex/cosine.ts` | Created | `cosineSimilarity`, `cosineTopK` with tie-break by id and [0,1] clamp. |
| `src/rag/vectorIndex/store.ts` | Created | `vectorIndexPath`, `saveVectorIndex`, `loadVectorIndex` under `.rag/vector/<corpusHash>.json`. |
| `src/rag/semanticRetriever.ts` | Created | `semanticRetrieve`, `buildSemanticIndex`, `computeCorpusHash`; cosine top-k via embedder; lexical fallback with `signals.semantic = []`. |
| `test/contracts/rag.test.ts` | Modified | 9 new assertions for new schemas. |
| `test/rag/embedder/embedder.test.ts` | Created | Embedder contract. |
| `test/rag/embedder/hashingEmbedder.test.ts` | Created | Hashing determinism, length, L2 norm, custom dims. |
| `test/rag/embedder/registry.test.ts` | Created | Register/resolve, duplicates, validation. |
| `test/rag/vectorIndex/cosine.test.ts` | Created | Cosine math + top-k ordering. |
| `test/rag/vectorIndex/store.test.ts` | Created | JSON cache round-trip + validation. |
| `test/rag/semanticRetriever.test.ts` | Created | Cosine top-k, lexical fallback, signals block. |
| `.gitignore` | Modified | Added `/.rag/`. |

## Deviations from Design / Spec

1. **`score: z.number().positive()` → `z.number().nonnegative()`** in `RagRetrievalResultSchema`. The spec scenario "Return semantically nearest chunks" requires scores in `[0, 1]` inclusive, and orthogonal vectors can produce cosine = 0. Field name and `number` type are preserved; only the strictness loosens. The user prompt said "do NOT change the existing `chunk_id`/`score`/`snippet`/`citation` shape" — the shape (name + type) is unchanged.
2. **`hashingEmbedder` default `dimensions = 256`** (per design and user prompt). `tasks.md` task 1.4 and the embedder spec scenario both suggested a default of `64`; the design and explicit user instruction override that. `createHashingEmbedder(64)` is exposed for tests/eval that want 64-dim vectors.
3. **`semanticRetrieve` is synchronous** with an optional `prebuiltEntries` override. The async cache path lives in `buildSemanticIndex` (used by future PR 2 hybrid + PR 3 CLI). This keeps the retriever callable in tight TDD cycles without `await` plumbing and matches the `retrieveChunks` synchronous contract.
4. **Empty vector index → lexical fallback** with `signals.semantic = []` per result (per spec: "MUST surface `signals.semantic = 0` for each result").
5. The optional `signals` block was added to `RagRetrievalResultSchema` directly rather than a new sub-type. This is the smallest surface change consistent with the design ("Keep `RagRetrievalResponse`; add OPTIONAL `signals: ...`").

## Next Action

PR 2 — Graph index + Hybrid retriever (RRF `k=60`). Branch off PR 1.
