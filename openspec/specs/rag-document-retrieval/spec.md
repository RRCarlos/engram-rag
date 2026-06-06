# Rag Document Retrieval Specification

## Purpose

Define deterministic corpus ingestion, chunk retrieval, and citation-ready JSON behavior for a local RAG baseline. The behavior is intentionally independent of embeddings, LLM generation, graph reasoning, and production persistence.

## Requirements

### Requirement: Validated Retrieval Contracts

The system MUST validate documents, chunks, retrieval queries, and retrieval results before returning them to callers. Valid results MUST include stable identifiers, scores, snippets, and citations sufficient to locate the source text.

#### Scenario: Accept valid retrieval input

- GIVEN a document corpus and a query with a positive top-k value
- WHEN the retrieval boundary validates the request
- THEN validation MUST succeed
- AND the accepted request MUST preserve the query text and top-k value.

#### Scenario: Reject invalid retrieval input

- GIVEN a query with empty text or a non-positive top-k value
- WHEN the retrieval boundary validates the request
- THEN validation MUST fail with a structured error
- AND no retrieval result MUST be emitted.

### Requirement: Deterministic Corpus Ingestion

The system MUST ingest local fixture documents into chunks deterministically. Each chunk MUST have a stable chunk ID, source document metadata, chunk order, and source location metadata suitable for citation.

#### Scenario: Produce stable chunks

- GIVEN the same fixture corpus and chunking options
- WHEN ingestion runs more than once
- THEN the emitted chunks MUST have identical IDs, order, text, and source metadata.

#### Scenario: Preserve source metadata

- GIVEN a fixture document with source identity and title metadata
- WHEN the document is ingested
- THEN every emitted chunk MUST reference the originating document
- AND every chunk MUST include citation location metadata.

### Requirement: Deterministic Chunk Retrieval

The system MUST retrieve up to the requested top-k chunks using deterministic lexical relevance scoring. Results MUST be ordered by descending score with a stable tie-breaker.

#### Scenario: Return highest scoring chunks first

- GIVEN an ingested corpus containing multiple chunks that match a query
- WHEN retrieval runs with top-k set to 2
- THEN exactly the two highest ranked chunks MUST be returned
- AND their scores MUST be in descending order.

#### Scenario: Return stable ordering for score ties

- GIVEN two or more chunks with equal relevance score for a query
- WHEN retrieval runs repeatedly
- THEN tied chunks MUST appear in the same deterministic order every time.

#### Scenario: Return empty results for no matches

- GIVEN an ingested corpus with no lexical matches for a query
- WHEN retrieval runs
- THEN the result list MUST be empty
- AND the response MUST still be valid JSON.

### Requirement: Citation-Ready JSON Output

The system MUST expose retrieval output as JSON from both a callable API boundary and a CLI boundary. The JSON shape MUST be consistent across boundaries for the same corpus, query, and top-k value.

#### Scenario: Emit citation fields

- GIVEN a query that matches at least one chunk
- WHEN retrieval output is serialized
- THEN each result MUST include chunk ID, score, snippet, and citation data
- AND citation data MUST identify the source document and location.

#### Scenario: Match API and CLI output

- GIVEN the same fixture corpus, query, and top-k value
- WHEN retrieval is invoked through the API boundary and the CLI boundary
- THEN both outputs MUST contain equivalent result JSON.

#### Scenario: Exclude generated answers

- GIVEN any retrieval query
- WHEN JSON output is produced
- THEN the output MUST NOT include LLM-generated answers, prompts, streaming events, embeddings, or graph reasoning fields.
