# Design: RAG Semantic + Graph Retrieval with Lexical Fusion

## Technical Approach

Extend the contract-first RAG boundary with three pluggable ranking paths (lexical,
semantic, co-mention graph) fused via Reciprocal Rank Fusion (`k=60`). The default
embedder is a deterministic hashing embedder, so semantic mode is testable without
network, secrets, or model weights. Vector and graph state persist as JSON under
`.rag/` (gitignored) and rebuild from the corpus on cold start. Default CLI mode
stays `lexical`; `--mode` and `--embedder` are opt-in. No new runtime dependencies.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|---|---|---|---|
| Embedder boundary | `Embedder` interface + hashing default | `@xenova/transformers`, hard-coded | Gates any future model adapter behind one boundary; hashing is a deterministic test scaffold with no provider secrets. |
| Hashing algorithm | 64-bit FNV-1a per token, sign-collision accumulator into N dims (default 256), L2-normalized | SBERT, BoW, random projections | Deterministic, dependency-free, dimension-stable; exercises the full cosine + RRF + persistence path. |
| Vector index | In-memory `Map<chunkId, Float32Array>` + cosine top-k; JSON cache `.rag/vector/<corpusHash>.json` | sqlite-vec, external DB | Fits the local-only contract; cosine top-k is O(n*d), trivial for fixtures; cache is a one-shot accelerator. |
| Entity extraction | Canonical-term regex dictionary, lowercased, deduped, sorted | NER, LLM | Deterministic, no network, predictable fixtures. |
| Co-mention graph | Undirected adjacency list; edges from chunks mentioning >=2 entities; per-node edge cap (default 8) | Directed/typed graph, triple store | Cheap "things that travel together" signal; cap bounds memory; JSON is trivial. |
| Hybrid fusion | RRF `k=60` over lexical + semantic + graph ranks | Linear combo, reranker, max | Rank-only (immune to score-scale drift), well-documented constant, trivially testable. |
| Response shape | Keep `RagRetrievalResponse`; add OPTIONAL `signals: { lexical?, semantic?, graph?, fused }` | New `RagHybridResponse` | Smallest surface change; existing consumers keep parsing. CLI default emits no `signals`. |
| CLI default | `--mode lexical` | `--mode hybrid` | Backward compatibility: archived kag-rag slice stays green until PR 3. |
| Persistence root + test runner | `.rag/{vector,graph}/` (gitignored) + Vitest under mirrored `src/test` layout | `node_modules/.rag/`, tmpdir, new test framework | Repo-local cache; honors `openspec/config.yaml` strict TDD and the existing `npm test` script. |

## Data Flow

`loadCorpusDocuments -> chunkDocuments` (existing) feed the new
`Embedder.embed` per chunk, `VectorIndex.build`, and `GraphIndex.extract`. The new
`HybridRetriever.retrieve(query, mode)` dispatches: `lexical` reuses
`retrieveChunks`; `semantic` calls `VectorIndex.topK`; `graph` calls
`GraphIndex.expand` (1-hop, edge-capped); `hybrid` applies RRF `k=60` over the three
rankings. Output is a `RagRetrievalResponse` with the optional `signals` block
written to `ragQuery` CLI stdout. On cold start, missing
`.rag/{vector,graph}/<corpusHash>.json` files are rebuilt from chunks and persisted;
`corpusHash` = sha256(sorted chunk IDs) so the cache follows corpus identity.

## File Changes (3-PR stack)

| PR | Files | Scope |
|---|---|---|
| PR 1 contracts + embedder + vector + semantic | `src/contracts/rag.ts`; `src/rag/embedder/{embedder,hashingEmbedder}.ts`; `src/rag/vectorIndex/{cosine,store}.ts`; `src/rag/semanticRetriever.ts`; matching tests under `test/contracts/`, `test/rag/embedder/`, `test/rag/vectorIndex/`, `test/rag/semanticRetriever.test.ts`; `.gitignore` | Embedder contract, hashing default, cosine top-k, JSON cache, semantic-mode retriever. |
| PR 2 graph + hybrid | `src/rag/graphIndex/{extract,store,traverse}.ts`; `src/rag/hybridRetriever.ts`; `test/rag/graphIndex/*`, `test/rag/hybridRetriever.test.ts`; extend `test/rag/retrieverPipeline.test.ts` | Regex extraction, adjacency list, 1-hop with edge cap, RRF `k=60`, mode dispatch. |
| PR 3 CLI + eval + close-out | `src/cli/ragQuery.ts`; extend `test/cli/ragQuery.test.ts` and `test/rag/ragEval.test.ts`; `eval/rag-scenarios/hybrid.json` | `--mode` and `--embedder` flags, default = `lexical`, CLI smoke for all modes, hybrid eval scenarios, `npm test` + `npx tsc --noEmit` green. |

## Interfaces / Contracts

```ts
// src/contracts/rag.ts (additions, all OPTIONAL fields preserve existing parsers)
export const EmbedderIdSchema = z.literal("hashing").or(z.string().min(1));
export const RetrievalModeSchema = z.enum(["lexical", "semantic", "graph", "hybrid"]);
export const RagSignalScoreSchema = z.object({ chunk_id: z.string().min(1), rank: z.number().int().nonnegative(), score: z.number().nonnegative() }).strict();
export const RagSignalsSchema = z.object({ lexical: z.array(RagSignalScoreSchema).optional(), semantic: z.array(RagSignalScoreSchema).optional(), graph: z.array(RagSignalScoreSchema).optional(), fused: z.array(RagSignalScoreSchema).optional() }).strict();
// RagRetrievalResultSchema gains signals: RagSignalsSchema.optional()

// src/rag/embedder/embedder.ts
export interface Embedder { readonly id: string; readonly dimensions: number; embed(text: string): Float32Array; }

// src/rag/hybridRetriever.ts
export function retrieveHybrid(query: RagQuery, chunks: DocumentChunk[], options: { embedder: Embedder; mode: RetrievalMode; corpusHash?: string }): RagRetrievalResponse;
```

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit - embedder / vector / graph / RRF | Determinism, L2 norm, cosine math, top-k, regex extraction, edge cap, 1-hop, `1/(k+rank)` | Bit-equal repeats; synthetic vectors; hand-crafted entity lists; table-driven RRF. |
| Integration | Load -> embed -> index -> graph -> hybrid retrieve | Extend pipeline test with `mode: "hybrid"`; assert citation fields + `signals.fused`. |
| Eval | Recall/citation under semantic, graph, hybrid | New `eval/rag-scenarios/hybrid.json` + `ragEval` assertions. |
| CLI smoke | `--mode semantic|graph|hybrid`, `--embedder default`, default = `lexical`, JSON parseable | Subprocess invocations mirroring the lexical pattern. |
| Regression | Archived kag-rag slice, full `npm test`, `npx tsc --noEmit` | CI gate per PR. |

## Migration / Rollout

Additive: `signals` is optional, existing `RagRetrievalResponse` consumers keep
parsing. Default CLI mode stays `lexical` until PR 3. `.rag/` is created on first
use and rebuilt on cold start. Rollback = delete the new files, the new contract
field, and the CLI flags; the lexical baseline and `kag-rag-functional` archive
stay green.

## Open Questions

None blocking. The two spec files under `openspec/changes/rag-semantic-graph/specs/`
are not on disk yet; this design captures the scenario intent (semantic ranking,
graph expansion, RRF fusion, default embedder, citation preservation, default-mode
backward compatibility) so `sdd-tasks` and `sdd-apply` are unblocked. Spec
artifacts can land in parallel.
