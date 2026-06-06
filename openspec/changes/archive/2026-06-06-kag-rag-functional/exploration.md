## Exploration: KAG/RAG functional current state

### Current State

The repository currently implements a narrow, contract-first retrieval/preflight system for SDD agent rigor, not a general-purpose KAG/RAG product. The functional path is:

1. A caller builds a `RetrievalRequest` with `project`, `agent_id`, `task_text`, `action_kind`, and optional `shell`/`cwd` metadata.
2. `buildRetrievalPlan()` deterministically maps that request to Engram `mem_context` and `mem_search` calls.
3. `runPreflight()` executes the plan against an `EngramTools` adapter, fetches full observations, returns applied rules, missing expected records, latency, and degraded status.
4. Fake fixtures and eval scenarios verify the narrow path; live HTTP support exists behind explicit CLIs.

What exists toward RAG/KAG:

- Strict `KnowledgeRecord` and retrieval request/plan schemas using Zod.
- A pure retrieval planner with trigger extraction for PowerShell, Bash, shell, spec/Gherkin, verify, and failures.
- Fake Engram adapter for deterministic CI retrieval over JSON knowledge fixtures.
- Live Engram HTTP adapter for `/health`, `/search`, `/observations/{id}`, `/sessions`, and `/observations`.
- Preflight runner and `preflightLive` CLI that retrieve records before an agent action and report degradation.
- Eval harness with scenario fixtures, top-k scoring, latency checks, and fake/live adapter selection.
- Skill patching utilities that inject live preflight instructions into SDD skills.

This is useful runtime plumbing, but it is still focused on retrieving procedural failure records for agents. It does not yet ingest arbitrary documents, build a knowledge graph, perform semantic retrieval, compose answers, or expose an end-user RAG/KAG query flow.

### missing_for_functional_kag_rag

- No document ingestion pipeline: there is no source loader, chunker, metadata extractor, or persistence path for arbitrary corpus documents.
- No embedding or vector index: retrieval is keyword/FTS-style through Engram search or fake substring scoring, with no semantic similarity layer.
- No knowledge graph model: the only knowledge shape is `KnowledgeRecord`; there are no entities, relations, graph traversal, graph storage, or provenance edges.
- No query-answer runtime: there is no service/CLI that accepts a user question, retrieves context, builds a prompt/context package, calls an LLM, and returns an answer with citations.
- No retrieval fusion/reranking: current planning emits fixed searches and deduplicates by observation id; it does not combine vector, lexical, graph, recency, or authority signals.
- No corpus management: no collection/index lifecycle, reindexing, deletion/update policy, or multi-corpus configuration.
- No production persistence owned by this repo: live mode assumes an external Engram HTTP API and maps observations heuristically into `KnowledgeRecord`s.
- No KAG-specific validation: existing eval scenarios prove known SDD failure recall, not answer faithfulness, citation coverage, graph reasoning, or hallucination resistance.

### Affected Areas

- `src/contracts/knowledgeRecord.ts` — current strict record schema is specialized for agent failure memory, not document chunks or graph facts.
- `src/contracts/retrieval.ts` — retrieval request/plan schema models pre-action agent lookup, not user query retrieval or answer generation.
- `src/retrieval/retrievalPlan.ts` — deterministic trigger planner is the current retrieval strategy; it has no semantic query planning or graph expansion.
- `src/engram/runPreflight.ts` — executes retrieval plans and converts results into applied rules; useful orchestration primitive but not a RAG answer runtime.
- `src/engram/fakeEngramAdapter.ts` — deterministic fixture-backed retrieval; good for tests, but not a production index.
- `src/engram/liveEngramAdapter.ts` — live HTTP bridge; currently depends on external Engram endpoints and heuristic Markdown-to-record conversion.
- `src/eval/*` and `eval/scenarios/*.json` — evaluation exists, but measures recall of fixture records and rules rather than KAG/RAG answer quality.
- `fixtures/knowledge/*.json` — seed knowledge is only three validated failure records.
- `src/cli/preflightLive.ts` and `src/cli/eval.ts` — CLIs support preflight/eval, not ingest/query/answer workflows.

### Approaches

1. **Add a minimal document-chunk retrieval slice** — introduce document/chunk contracts, local fixture ingestion, lexical retrieval, and an answer-context CLI that returns retrieved chunks with citations only.
   - Pros: Safest first step; establishes corpus/runtime boundaries without needing embeddings, a database, or an LLM provider; fits strict TDD and review budget.
   - Cons: Not semantic RAG yet; answer generation remains out of scope; KAG graph reasoning remains out of scope.
   - Effort: Medium

2. **Add semantic vector retrieval first** — add embeddings, vector storage, similarity search, and query API.
   - Pros: Closer to common RAG expectations; improves semantic recall.
   - Cons: Requires provider/storage choices, secrets/config, nondeterministic integration testing, and larger architecture decisions before the repo has a corpus model.
   - Effort: High

3. **Add knowledge graph modeling first** — introduce entities, relations, extraction, graph storage, and graph traversal.
   - Pros: Moves directly toward KAG rather than plain RAG.
   - Cons: Too much schema and extraction surface before document ingestion and query runtime exist; high risk of speculative design.
   - Effort: High

### Recommendation

Start with **Add a minimal document-chunk retrieval slice**.

The first SDD implementation slice should make the repo functional at the smallest honest runtime boundary: ingest a local fixture corpus into validated chunks, retrieve relevant chunks for a query, and return a citation-ready context package through a CLI or pure API. Keep answer generation, embeddings, vector DBs, and graph expansion explicitly out of scope for this first slice.

Suggested first slice:

- Add contracts for `DocumentSource`, `DocumentChunk`, `RagQuery`, and `RagRetrievalResult`.
- Add a fixture-backed corpus loader under `fixtures/corpus/` or equivalent.
- Add deterministic chunking and lexical scoring in `src/rag/` with mirrored tests.
- Add `src/cli/ragQuery.ts` that accepts a query and prints retrieved chunk ids, scores, snippets, and source refs as JSON.
- Add eval scenarios that assert top-k chunk recall and citation presence.
- Preserve the existing SDD preflight path unchanged.

This gives the next phases concrete behavior to specify and verify while staying under the 400-line review budget if split carefully.

### Risks

- The name KAG/RAG can tempt the implementation to jump straight to embeddings, LLM calls, and graph extraction before the repository has stable corpus contracts.
- The existing `KnowledgeRecord` model should not be stretched into document chunks; doing so would couple agent failure memory to user-facing retrieval.
- Live Engram integration is useful but not sufficient as the only persistence/index layer for a functional KAG/RAG runtime.
- Eval can give false confidence if it continues to measure only fixture failure recall instead of corpus query relevance and citation quality.
- Current working tree already contains unrelated modified/untracked files; implementation should isolate this change carefully.

### Ready for Proposal

Yes. The proposal should scope the first implementation to deterministic document chunk retrieval with citation-ready output, and explicitly defer embeddings, LLM answer generation, graph modeling, and production persistence until later slices.
