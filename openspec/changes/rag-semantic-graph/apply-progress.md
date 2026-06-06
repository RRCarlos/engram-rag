# Apply Progress: rag-semantic-graph (PR 1 + PR 2)

**Branch (PR 1):** `feat/rag-semantic-pr1`
**Branch (PR 2):** `feat/rag-semantic-pr2` (stacked on PR 1, same base `chore/archive-kag-rag-functional`)
**Chain strategy:** `stacked-to-main` (PR 2 of 3)
**Mode:** Strict TDD
**Started (PR 1):** 2026-06-06
**PR 2 status:** GREEN — `npm test` clean (49 files / 586 passed / 1 skipped), `npx tsc --noEmit` clean

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

## TDD Cycle Evidence (PR 2)

| Task | RED test | GREEN impl | REFACTOR | Status |
|------|----------|------------|----------|--------|
| 2.1 RED: extract (regex dedup, sort, determinism, whole-word) + traverse (1-hop, edge cap 8) | test/rag/graphIndex/extract.test.ts (5) + test/rag/graphIndex/traverse.test.ts (5) | n/a (red) | n/a | DONE |
| 2.2 GREEN: implement graphIndex/extract.ts, store.ts, traverse.ts | (covered by 2.1) | src/rag/graphIndex/{extract,store,traverse}.ts | n/a (extracted to single files) | DONE |
| 2.2b TRIANGULATE: store round-trip + validation | test/rag/graphIndex/store.test.ts (6) | (covered by 2.2) | n/a | DONE |
| 2.3 RED: RRF k=60 table-driven + graceful absence | test/rag/hybridRetriever.test.ts (5 RRF cases) | n/a (red) | n/a | DONE |
| 2.4 GREEN: implement hybridRetriever with mode dispatch | (covered by 2.3) | src/rag/hybridRetriever.ts | toRagSignal/toRagSignals helpers hoist repeated literal mapping | DONE |
| 2.5 Extend retrieverPipeline with `mode: "hybrid"` + citation + `signals.fused` | test/rag/retrieverPipeline.test.ts (+1 test) | n/a (extends) | n/a | DONE |
| 2.6 REFACTOR: hoist RRF helper to `src/rag/rrf.ts` | n/a | src/rag/rrf.ts (DEFAULT_RRF_K=60, fuseRankings, toRagSignalScores) | full suite + tsc clean | DONE |

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

## Files Changed (PR 2)

| File | Action | Notes |
|------|--------|-------|
| `src/rag/graphIndex/extract.ts` | Created | `extractEntities(text, { dictionary? })`. Sorted, deduplicated, lowercased, whole-word regex over canonical-term dictionary. Default dictionary ships 7 terms. |
| `src/rag/graphIndex/store.ts` | Created | `GraphIndex` shape (corpusHash, edgeCap, chunkEntities, entityChunks, entityEdges), `buildGraphIndex`, `saveGraphIndex`, `loadGraphIndex` under `.rag/graph/<corpusHash>.json`. Per-node edge cap default 8. |
| `src/rag/graphIndex/traverse.ts` | Created | `traverseOneHop(seeds, index, chunks, { edgeCap? })` — deterministic edge-weighted score (`shared / seedEntities`), 1-hop expansion, stable ordering. |
| `src/rag/rrf.ts` | Created | `DEFAULT_RRF_K = 60`, `fuseRankings(rankings, k?)`, `toRagSignalScores(entries)`. Sum-of-`1/(k+rank)` with chunk-id tie-break; missing signals contribute zero. |
| `src/rag/hybridRetriever.ts` | Created | `retrieveHybrid(query, chunks, { embedder, mode, prebuiltEntries?, prebuiltGraph?, graphDictionary?, edgeCap?, k?, cacheRoot?, corpusHash? })`. Dispatches `lexical` / `semantic` / `graph` / `hybrid`. Hybrid builds lexical + semantic + graph rankings, fuses with RRF, emits `signals.{lexical,semantic,graph,fused}`. |
| `test/rag/graphIndex/extract.test.ts` | Created | 5 assertions: sorted/dedup/lowercase/deterministic, empty input, custom dict, whole-word boundaries, empty+empty stable. |
| `test/rag/graphIndex/store.test.ts` | Created | 6 assertions: adjacency shape, `graphIndexPath` join, JSON round-trip, missing cache, edge-cap validation, corpusHash mismatch. |
| `test/rag/graphIndex/traverse.test.ts` | Created | 5 assertions: 1-hop expansion, default edge cap = 8, custom edge cap override, isolated seed returns only itself, deterministic ordering. |
| `test/rag/hybridRetriever.test.ts` | Created | 11 assertions: `DEFAULT_RRF_K=60`, two-ranking fusion order, empty rankings, single-signal fusion, tie-break, mode dispatch (4 modes), fused mode `signals.fused` present + top-level score == fused, graceful absence, citation preservation across modes. |
| `test/rag/retrieverPipeline.test.ts` | Modified | Added `mode: "hybrid"` test asserting citation fields and `signals.fused` matches top-level score on real corpus fixtures. |
| `openspec/changes/rag-semantic-graph/tasks.md` | Modified | PR 2 tasks marked `[x]`. |
| `openspec/changes/rag-semantic-graph/apply-progress.md` | Modified | This file. |

## Deviations from Design / Spec (PR 1)

1. **`score: z.number().positive()` → `z.number().nonnegative()`** in `RagRetrievalResultSchema`. The spec scenario "Return semantically nearest chunks" requires scores in `[0, 1]` inclusive, and orthogonal vectors can produce cosine = 0. Field name and `number` type are preserved; only the strictness loosens. The user prompt said "do NOT change the existing `chunk_id`/`score`/`snippet`/`citation` shape" — the shape (name + type) is unchanged.
2. **`hashingEmbedder` default `dimensions = 256`** (per design and user prompt). `tasks.md` task 1.4 and the embedder spec scenario both suggested a default of `64`; the design and explicit user instruction override that. `createHashingEmbedder(64)` is exposed for tests/eval that want 64-dim vectors.
3. **`semanticRetrieve` is synchronous** with an optional `prebuiltEntries` override. The async cache path lives in `buildSemanticIndex` (used by future PR 2 hybrid + PR 3 CLI). This keeps the retriever callable in tight TDD cycles without `await` plumbing and matches the `retrieveChunks` synchronous contract.
4. **Empty vector index → lexical fallback** with `signals.semantic = []` per result (per spec: "MUST surface `signals.semantic = 0` for each result").
5. The optional `signals` block was added to `RagRetrievalResultSchema` directly rather than a new sub-type. This is the smallest surface change consistent with the design ("Keep `RagRetrievalResponse`; add OPTIONAL `signals: ...`").
6. **PR base changed to `chore/archive-kag-rag-functional`** (not `main`). The RAG foundation work lives on the archive branch and was never merged to `main`; targeting `main` would force a 55-file / 3623-line diff that mixes the foundation with PR 1. Stacking on the archive branch keeps the diff focused on PR 1 scope (21 files, +1613/-1) and matches the `stacked-to-main` chain strategy in spirit: when the foundation + archive merge to `main`, this stack can re-target. The PR body and description call this out explicitly.

## Deviations from Design / Spec (PR 2)

1. **Default dictionary for `extractEntities`** ships 7 terms (`engram`, `graph`, `lexical`, `memory`, `rag`, `semantic`, `vectors`). This is a hand-curated minimum so a vanilla caller can use the graph without a custom dictionary. All PR 2 tests pass an explicit dictionary to keep assertions stable. A future PR can promote this default to a JSON-loaded term bank without breaking the API.
2. **Graph scoring: `shared / seedEntities`**, clamped to `[0, 1]`. Seeds always score `1`. The spec says "deterministic edge-weighted score" without fixing the formula. The chosen formula is the most direct count-normalized edge weight that admits a [0, 1] signal. Tie-break is `chunk_id` ascending.
3. **Per-node edge cap semantics**: capped per *seed chunk* (not per entity). The "star" traversal test (12 entities, 12 leaf chunks, central seed) verifies that the central seed pulls in exactly `min(neighbors, edgeCap) = 8` leaves. Per-entity capping would not have constrained the central seed's expansion, so per-seed is the interpretation that matches the design's "co-mention graph: per-node edge cap (default 8)" language in the context of 1-hop expansion.
4. **`retrieveHybrid` is synchronous**, mirroring the lexical and semantic retrievers' synchronous contract. The async cache path for the graph and vector indices lives in PR 3's CLI smoke tests. Callers that already hold the indices pass them via `prebuiltEntries` / `prebuiltGraph`.
5. **Mode dispatch returns `RagRetrievalResponse` for all four modes** with mode-appropriate `signals` blocks. Lexical mode emits only `signals.lexical`; semantic mode emits `signals.semantic` and falls back to lexical with `signals.semantic = []` when the index is absent (per spec scenario). Graph mode emits `signals.graph` and falls back to lexical when no graph is available. Hybrid mode emits all four sub-scores and the top-level `score` equals the fused RRF score.
6. **Hybrid falls back to lexical-only fusion when both `prebuiltEntries` and `prebuiltGraph` are absent** (per spec "Degrade gracefully when one signal is absent"). The lexical contribution is full; semantic and graph contribute zero. `signals.fused` is always present on hybrid results.
7. **PR base = `chore/archive-kag-rag-functional`** (same deviation as PR 1). The stacked branch `feat/rag-semantic-pr2` is based on `feat/rag-semantic-pr1`, which itself is based on the archive branch. The two-PR stack keeps the diff focused on PR 2 scope (10 files / +816 / -8) instead of mixing PR 1 + PR 2 into one 31-file monster.

## PR / Branch / Commit

### PR 1

- **Branch**: `feat/rag-semantic-pr1` (pushed to origin)
- **Base branch**: `chore/archive-kag-rag-functional` (deviation from `main` — see deviation #6 in PR 1)
- **Commit SHA**: `01ce111`
- **Push URL**: `https://github.com/RRCarlos/engram-rag/tree/feat/rag-semantic-pr1`
- **PR URL**: `https://github.com/RRCarlos/engram-rag/pull/22` (stacked, 21 files / +1613 / -1)
- **Test/Typecheck**: 45 files / 540 passed (1 skipped); `npx tsc --noEmit` clean

### PR 2

- **Branch**: `feat/rag-semantic-pr2` (stacked on PR 1, same base `chore/archive-kag-rag-functional`)
- **Base branch**: `chore/archive-kag-rag-functional` (chain base)
- **Commit SHA**: (filled in after commit)
- **Push URL**: (filled in after push)
- **PR URL**: (filled in after `gh pr create`)
- **Test/Typecheck**: 49 files / 586 passed (1 skipped); `npx tsc --noEmit` clean
- **Diff**: 10 files / +816 / -8

## Next Action

PR 3 — CLI flags (`--mode lexical|semantic|graph|hybrid`, `--embedder hashing|<id>`) + hybrid eval scenarios + close-out. Branch off PR 2 (`feat/rag-semantic-pr2`) and target the same base (`chore/archive-kag-rag-functional`) per the same `stacked-to-main` chain strategy.

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
6. **PR base changed to `chore/archive-kag-rag-functional`** (not `main`). The RAG foundation work lives on the archive branch and was never merged to `main`; targeting `main` would force a 55-file / 3623-line diff that mixes the foundation with PR 1. Stacking on the archive branch keeps the diff focused on PR 1 scope (21 files, +1613/-1) and matches the `stacked-to-main` chain strategy in spirit: when the foundation + archive merge to `main`, this stack can re-target. The PR body and description call this out explicitly.

## PR / Branch / Commit

- **Branch**: `feat/rag-semantic-pr1` (pushed to origin)
- **Base branch**: `chore/archive-kag-rag-functional` (deviation from `main` — see deviation #6)
- **Commit SHA**: `01ce111`
- **Push URL**: `https://github.com/RRCarlos/engram-rag/tree/feat/rag-semantic-pr1`
- **PR URL**: `https://github.com/RRCarlos/engram-rag/pull/22` (stacked, 21 files / +1613 / -1)
- **Test/Typecheck**: 45 files / 540 passed (1 skipped); `npx tsc --noEmit` clean

## Next Action

PR 2 — Graph index + Hybrid retriever (RRF `k=60`). Branch off PR 1 (`feat/rag-semantic-pr1`) and target the same base (`chore/archive-kag-rag-functional`) per the same `stacked-to-main` chain strategy.
