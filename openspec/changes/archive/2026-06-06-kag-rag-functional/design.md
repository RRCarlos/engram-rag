# Design: KAG/RAG Functional First Slice

## Technical Approach

Add a new contract-first `src/rag/` boundary for deterministic fixture corpus ingestion, chunking, lexical retrieval, and citation-ready JSON output. Existing `KnowledgeRecord`, preflight, Engram adapters, and phase eval code remain unchanged because they model agent memory retrieval, not corpus document retrieval.

No delta spec existed when this design was written; this design is based on `proposal.md`, `exploration.md`, project OpenSpec rules, and the current source/tests while spec work may run in parallel.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| RAG boundary | Create `src/contracts/rag.ts` and `src/rag/*` | Reuse `KnowledgeRecord` or `src/retrieval/*` | Preserves the existing contract-first boundary and avoids coupling agent failure memory to corpus chunks. |
| Corpus source | Load JSON fixtures from `fixtures/corpus/*.json` | Markdown parsing, live Engram, database | JSON keeps validation strict, deterministic, and testable without new dependencies or persistence choices. |
| Chunking | Pure deterministic chunker with stable IDs derived from document ID and chunk index | Tokenizer libraries or semantic splitters | Fits Node/Zod/Vitest stack, keeps results reproducible, and avoids provider/storage decisions. |
| Retrieval | Pure lexical scorer with deterministic tie-breaks | Embeddings, vector DB, reranking | Establishes a reliable baseline under strict TDD; semantic RAG remains out of scope. |
| CLI output | `src/cli/ragQuery.ts` prints only validated JSON | Natural-language answers | Citation-ready context is the first honest runtime boundary; answer generation would add LLM risk. |

## Data Flow

```text
fixtures/corpus/*.json
  -> loadCorpusDocuments()
  -> chunkDocuments()
  -> retrieveChunks(query, chunks)
  -> RagRetrievalResponse JSON
       -> src/cli/ragQuery.ts stdout
```

## File Changes

| File | Action | Description |
|---|---|---|
| `src/contracts/rag.ts` | Create | Zod schemas and parse helpers for `DocumentSource`, `DocumentChunk`, `RagQuery`, citation, result item, and response. |
| `src/rag/corpusLoader.ts` | Create | Reads `fixtures/corpus/*.json` from a provided or default directory and validates documents. |
| `src/rag/chunker.ts` | Create | Splits document text into stable chunks with source metadata, offsets/line ranges where available, and deterministic IDs. |
| `src/rag/retriever.ts` | Create | Normalizes query terms, scores chunks lexically, sorts by score then chunk ID, and returns top-k citation-ready results. |
| `src/cli/ragQuery.ts` | Create | Parses `--query`, optional `--top-k`/`--corpus-dir`, runs loader/chunker/retriever, and prints JSON. |
| `fixtures/corpus/*.json` | Create | Small deterministic corpus with enough overlap to test ranking and citations. |
| `test/contracts/rag.test.ts` | Create | Schema validation and strict rejection tests mirroring existing contract tests. |
| `test/rag/*.test.ts` | Create | Loader, chunker, and retriever unit tests. |
| `test/cli/ragQuery.test.ts` | Create | Subprocess/in-process CLI JSON output and citation field tests. |
| `eval/rag-scenarios/*.json` or `test/rag/ragEval.test.ts` | Create | Minimal recall/citation scenarios without changing existing phase4 eval. |

## Interfaces / Contracts

```ts
type RagRetrievalResponse = {
  query: string;
  top_k: number;
  results: Array<{
    chunk_id: string;
    score: number;
    snippet: string;
    citation: { document_id: string; title: string; source_path: string };
  }>;
};
```

Schemas MUST be `.strict()` and parse helpers SHOULD mirror `parseKnowledgeRecord` / safe parse patterns.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Rag schemas, chunk IDs, chunk metadata, lexical scoring, tie-breaks | Vitest under mirrored `test/contracts` and `test/rag` paths. |
| Integration | Fixture load -> chunk -> retrieve JSON with citations | In-process pipeline test using `fixtures/corpus`. |
| CLI | `node --import tsx src/cli/ragQuery.ts --query ...` emits parseable JSON | Subprocess test patterned after `test/cli/eval.test.ts`. |
| Regression | Existing preflight/eval path unchanged | Run `npm test` and `npx tsc --noEmit`. |

## Migration / Rollout

No migration required. This slice adds an isolated RAG boundary and fixtures only. Rollback is deletion of the created files.

## Open Questions

- [ ] Final delta spec path/name if the parallel spec phase creates one after this design.
