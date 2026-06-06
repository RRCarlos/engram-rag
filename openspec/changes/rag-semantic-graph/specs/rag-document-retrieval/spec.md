# Delta for Rag Document Retrieval

## MODIFIED Requirements

### Requirement: Citation-Ready JSON Output

The system MUST expose retrieval output as JSON from both an API and a CLI boundary with consistent shape. When a non-lexical mode (`semantic`, `graph`, `hybrid`) is requested, each result MAY include a `signals` block with per-mode scores; the top-level `score` MUST equal the fused score when fusion is active.
(Previously: lexical-only; no `signals` block.)

#### Scenario: Emit citation fields

- GIVEN a query that matches at least one chunk
- WHEN retrieval output is serialized
- THEN each result MUST include chunk ID, score, snippet, and citation data
- AND citation data MUST identify the source document and location.

#### Scenario: Match API and CLI output

- GIVEN the same fixture corpus, query, and top-k
- WHEN retrieval runs through both the API and CLI boundary
- THEN both outputs MUST contain equivalent result JSON.

#### Scenario: Exclude generated answers

- GIVEN any retrieval query
- WHEN JSON output is produced
- THEN the output MUST NOT include LLM-generated answers, prompts, streaming events, embeddings, or graph reasoning fields.

#### Scenario: Emit optional signals block in hybrid mode

- GIVEN a query and a `hybrid` retrieval with populated lexical, semantic, and graph rankings
- WHEN retrieval output is serialized
- THEN each result MAY include a `signals` object with `lexical`, `semantic`, and `graph` sub-scores
- AND the top-level `score` MUST equal the RRF-fused score
- AND absent signals MUST emit a zero value within `signals`.

## ADDED Requirements

### Requirement: Default Lexical Mode Preservation

The system MUST default to `lexical` retrieval mode when no explicit mode is requested. Lexical results MUST remain bit-identical to the archived lexical-only baseline for the same corpus, query, and top-k.

#### Scenario: Default to lexical mode

- GIVEN the `ragQuery` CLI invoked without a `--mode` flag
- WHEN retrieval runs
- THEN the active mode MUST be `lexical`
- AND the result list MUST match the lexical-only baseline byte-for-byte.

### Requirement: Semantic-Only Retrieval

The system MUST support a `semantic` mode that ranks chunks by cosine similarity between the query embedding and chunk embeddings produced by the active `Embedder`.

#### Scenario: Return semantically nearest chunks

- GIVEN an ingested corpus and an active `Embedder`
- WHEN retrieval runs in `semantic` mode with a positive top-k
- THEN results MUST be ordered by descending cosine similarity
- AND each score MUST lie in the inclusive range [0, 1].

#### Scenario: Fall back to lexical when no semantic index exists

- GIVEN an empty or absent vector index for the current corpus
- WHEN retrieval runs in `semantic` mode
- THEN the system MUST return the lexical-ranked result list
- AND MUST surface `signals.semantic = 0` for each result.

### Requirement: Graph-Expanded Retrieval

The system MUST support a `graph` mode that expands a seed set of chunks by traversing 1-hop co-mention edges in the entity adjacency graph, then re-ranks by deterministic edge-weighted score.

#### Scenario: Expand seeds by 1-hop neighbors

- GIVEN a populated graph index and seed chunks from a lexical or semantic first pass
- WHEN retrieval runs in `graph` mode
- THEN the result list MUST include seed chunks and their 1-hop neighbors
- AND ordering MUST be deterministic by descending graph score with chunk-ID tie-break.

#### Scenario: Skip graph when adjacency list is empty

- GIVEN a corpus with no extracted entities
- WHEN retrieval runs in `graph` mode
- THEN the result list MUST equal the lexical-ranked result list
- AND no error MUST be raised.

### Requirement: RRF-Fused Hybrid Retrieval

The system MUST support a `hybrid` mode that fuses lexical, semantic, and graph rankings via Reciprocal Rank Fusion (RRF) into a single ordered list while preserving citation fields.

#### Scenario: Fuse three signals with RRF

- GIVEN a query and populated lexical, semantic, and graph rankings
- WHEN retrieval runs in `hybrid` mode
- THEN the fused ranking MUST be ordered by descending RRF score
- AND each result MUST include `chunk_id`, `snippet`, and `citation`
- AND the top-level `score` MUST equal the RRF-fused score.

#### Scenario: Degrade gracefully when one signal is absent

- GIVEN a query where one of the three signals has no candidates
- WHEN retrieval runs in `hybrid` mode
- THEN fusion MUST proceed with the available signals only
- AND absent signals MUST contribute a zero RRF contribution for the missing ranks.
