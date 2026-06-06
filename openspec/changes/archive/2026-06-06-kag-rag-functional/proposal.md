# Proposal: KAG/RAG Functional First Slice

## Intent

Make the repository honestly functional for the smallest KAG/RAG boundary: deterministic document ingestion, chunk retrieval, and citation-ready JSON output. This addresses the current gap where the codebase retrieves agent preflight memories but cannot ingest or query arbitrary corpus documents.

## Scope

### In Scope
- Add validated document, chunk, query, and retrieval-result contracts.
- Load a local fixture corpus and deterministically chunk documents with source metadata.
- Retrieve top-k chunks with lexical scoring and return citation-ready JSON through a pure API and CLI.
- Add tests/eval scenarios for chunk recall, score ordering, and citation fields.

### Out of Scope
- Embeddings, vector databases, semantic similarity, reranking, and provider secrets.
- LLM answer generation, prompt composition, streaming, or hallucination checks.
- Knowledge graph entities, relations, extraction, traversal, or graph reasoning.
- Production persistence, corpus lifecycle management, and changes to the existing SDD preflight path.

## Capabilities

### New Capabilities
- `rag-document-retrieval`: Corpus fixture ingestion, deterministic chunking, lexical chunk retrieval, and citation-ready JSON results for user queries.

### Modified Capabilities
- None. `openspec/specs/` is currently empty, and the existing preflight behavior remains unchanged.

## Approach

Create a separate `src/rag/` boundary instead of stretching `KnowledgeRecord` into document chunks. Keep schemas in `src/contracts/`, fixtures under `fixtures/corpus/`, CLI output in `src/cli/ragQuery.ts`, and mirrored tests under `test/`. Use deterministic scoring and stable chunk IDs so strict TDD and eval assertions remain reliable. The first slice should stay within the 400-line review budget if implemented as contracts + loader/retriever + CLI/tests; if forecast grows, split CLI/eval polish into a follow-up PR.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/contracts/` | New | Document, chunk, query, and result schemas. |
| `src/rag/` | New | Corpus loading, chunking, lexical retrieval. |
| `src/cli/ragQuery.ts` | New | Query CLI emitting JSON with citations. |
| `fixtures/corpus/` | New | Small deterministic corpus fixtures. |
| `test/` and `eval/` | Modified | Behavior, CLI, and recall/citation coverage. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Overbuilding toward embeddings/LLMs/graph too early | Med | Keep explicit non-goals and deterministic contracts. |
| Coupling corpus chunks to `KnowledgeRecord` | Med | Use a separate `src/rag/` and contract namespace. |
| Weak relevance from lexical retrieval | Med | Treat it as a deterministic baseline, not final semantic RAG. |

## Rollback Plan

Remove the new RAG contracts, `src/rag/`, `src/cli/ragQuery.ts`, corpus fixtures, and related tests/eval scenarios. Existing preflight CLIs, Engram adapters, and retrieval planner should continue unchanged.

## Dependencies

- Existing TypeScript, Zod, Vitest, and tsx CLI stack only.

## Success Criteria

- [ ] Local fixture documents ingest into stable chunks with source metadata.
- [ ] A query returns top-k chunks as JSON with chunk IDs, scores, snippets, and citations.
- [ ] Tests prove deterministic ranking and citation presence.
- [ ] Existing preflight tests continue to pass unchanged.
