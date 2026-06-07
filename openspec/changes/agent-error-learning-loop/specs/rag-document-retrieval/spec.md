# Delta for Rag Document Retrieval

## ADDED Requirements

### Requirement: Token Chunking Contract Accuracy

The system MUST keep `rag_ingest` input schema, documentation, and chunking behavior consistent for chunk size and overlap units.

#### Scenario: Honor configured token chunking

- GIVEN `rag_ingest` receives `chunk_size` and `chunk_overlap`
- WHEN a corpus is ingested
- THEN chunk boundaries MUST follow the documented token-based units
- AND overlap MUST NOT exceed chunk size.

#### Scenario: Reject invalid overlap

- GIVEN `chunk_overlap >= chunk_size`
- WHEN ingestion validates input
- THEN ingestion MUST fail with a structured validation error
- AND MUST NOT write partial index artifacts.

### Requirement: Corpus-Derived Graph Retrieval

The system MUST build graph retrieval inputs from the active corpus or explicit configuration, not fixture-only dictionaries.

#### Scenario: Build graph from corpus entities

- GIVEN a corpus with repeated entities across chunks
- WHEN graph indexing runs
- THEN adjacency MUST reflect corpus co-mentions
- AND graph retrieval MAY expand only through indexed corpus edges.

#### Scenario: Avoid fixture-only success

- GIVEN no fixture dictionary is available
- WHEN graph or hybrid retrieval runs on a valid corpus
- THEN retrieval MUST still complete deterministically
- AND MUST NOT depend on hard-coded fixture entities.

### Requirement: Content-Sensitive Corpus Hash

The system MUST include chunk content and indexing configuration in corpus hash calculations.

#### Scenario: Content edits change hash

- GIVEN two corpora with identical chunk IDs but different chunk text
- WHEN corpus hashes are computed
- THEN the hashes MUST differ.

#### Scenario: Config edits change hash

- GIVEN identical corpus files with different chunking or embedder configuration
- WHEN corpus hashes are computed
- THEN the hashes MUST differ.
