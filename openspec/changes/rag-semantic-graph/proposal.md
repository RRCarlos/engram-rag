# Proposal: RAG Semantic + Graph Retrieval with Lexical Fusion

## Intent

Extend the deterministic lexical RAG foundation with semantic retrieval (embeddings + in-memory vector index) and a lightweight co-mention graph index, fused with lexical scoring via Reciprocal Rank Fusion (RRF). Lexical retrieval stays as the deterministic fallback and as one of the fused signals. This moves the repo from "keyword RAG" to a real KAG/RAG capability while keeping citations, deterministic contracts, and strict TDD intact.

## Scope

### In Scope

- Pluggable `Embedder` interface with a deterministic hashing embedder as the default (no provider secrets, no network, fully testable).
- In-memory vector index keyed by stable chunk ID, cosine similarity search, persisted-once JSON cache.
- Adjacency-list graph index (entity nodes, undirected co-mention edges) persisted as JSON, with deterministic entity extraction from chunk text.
- Hybrid retriever that fuses lexical, semantic, and graph rankings via RRF and emits citation-ready JSON with optional `signals` breakdown.
- Extended `ragQuery` CLI with `--mode lexical|semantic|graph|hybrid` and `--embedder hashing|<name>` flags.
- Tests/eval scenarios proving fused ranking, citations, and deterministic-by-default behavior.

### Out of Scope

- LLM answer generation, prompt composition, streaming, hallucination checks.
- External vector DBs (Pinecone, Qdrant, pgvector), production graph DBs, networked embedder services.
- Multi-corpus lifecycle, reindexing pipelines, corpus update/delete policy.
- Real transformer embedding weights; the default embedder is a hashing embedder and any future model adapter is gated behind the `Embedder` interface.

## Capabilities

### New Capabilities

- `rag-embedder-interface`: `Embedder` contract (`embed(text) -> number[]`, `dimensions`, `id`) plus a deterministic hashing implementation as the default.

### Modified Capabilities

- `rag-document-retrieval`: retrieval results now support semantic and graph ranking paths, fused with lexical. Top-level result shape keeps `chunk_id`, `score`, `snippet`, `citation`. New optional `signals` block exposes per-mode scores and the fused `score`. The "Exclude generated answers" requirement is preserved. New scenarios cover semantic ranking, graph expansion, fusion, and fallback behavior.

## Approach

Keep the contract-first boundary: extend `src/contracts/rag.ts` with new schemas (`EmbedderId`, `RetrievalMode`, `RagSignals`, `RagHybridResponse`) without breaking existing `RagRetrievalResponse`. Add `src/rag/embedder/{interface,hashingEmbedder}.ts`, `src/rag/vectorIndex/{store,cosine}.ts`, `src/rag/graphIndex/{extract,store,traverse}.ts`, and `src/rag/hybridRetriever.ts` that wraps the existing lexical retriever. Persist vector + graph state under `.rag/` (gitignored) and rebuild deterministically from the corpus on cold start. CLI in `src/cli/ragQuery.ts` gains `--mode` / `--embedder` flags; default behavior stays backward compatible (lexical-only).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/contracts/rag.ts` | Modified | New schemas: `EmbedderId`, `RetrievalMode`, `RagSignals`, `RagHybridResponse`. Existing schemas unchanged. |
| `src/rag/embedder/` | New | `Embedder` interface + deterministic hashing embedder. |
| `src/rag/vectorIndex/` | New | In-memory cosine index, JSON cache under `.rag/vector/`. |
| `src/rag/graphIndex/` | New | Deterministic entity extraction, adjacency list, JSON cache under `.rag/graph/`. |
| `src/rag/hybridRetriever.ts` | New | RRF fusion of lexical + semantic + graph, citation-preserving. |
| `src/cli/ragQuery.ts` | Modified | `--mode` and `--embedder` flags; default mode = `lexical`. |
| `test/` and `eval/` | Modified | Mirrored unit/integration/CLI/eval tests for every new path. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Hashing embedder quality is weak; "semantic" results look noisy | Med | Treat hashing embedder as a deterministic test scaffold; document plug-in path for a real model; keep lexical fusion so signal is not lost. |
| Fused ranking changes the top-k result order vs. the archived lexical-only slice | Med | Lexical-only mode is still the default and the default CLI flag; hybrid is opt-in; tests pin current lexical fixtures. |
| Graph index bloats from co-mention edges on bigger corpora | Low | Cap edges per entity, persist once, ignore during tests; deterministic extraction prevents drift. |
| Slice exceeds 400-line review budget | High | Plan a chained PR stack (see tasks.md). |

## Rollback Plan

Delete `src/rag/embedder/`, `src/rag/vectorIndex/`, `src/rag/graphIndex/`, `src/rag/hybridRetriever.ts`, the `.rag/` cache, and the new contract fields that extend `RagRetrievalResponse`. Revert the `--mode`/`--embedder` flag additions in `src/cli/ragQuery.ts`. The archived `kag-rag-functional` lexical slice and `rag-document-retrieval` core spec are untouched and remain the deterministic baseline.

## Dependencies

- Existing TypeScript, Zod, Vitest, tsx stack only. No new runtime dependencies.
- Optional dev-only JSON persistence under `.rag/` (gitignored).

## Success Criteria

- [ ] Hashing embedder is deterministic, dimension-stable, and tested for shape, normalization, and reproducibility.
- [ ] Vector index supports cosine top-k over the fixture corpus with persisted JSON cache.
- [ ] Graph index extracts entities, builds co-mention edges, and answers 1-hop neighbor queries deterministically.
- [ ] Hybrid retriever fuses lexical + semantic + graph via RRF and preserves the existing citation fields.
- [ ] `ragQuery` CLI supports `--mode lexical|semantic|graph|hybrid` with default = `lexical`; JSON output stays parseable and citation-complete.
- [ ] All new behavior has red-green-refactor test evidence; `npm test` and `npx tsc --noEmit` pass cleanly.
- [ ] Existing RAG foundation tests and the `rag-document-retrieval` spec scenarios remain green.
