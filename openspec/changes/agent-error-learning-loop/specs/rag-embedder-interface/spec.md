# Delta for Rag Embedder Interface

## MODIFIED Requirements

### Requirement: Default Hashing Implementation

The system MUST ship a default `hashing` `Embedder` whose `embed` uses a deterministic feature-hashing function over normalized tokens. The default MUST run without network access, provider secrets, or runtime dependencies beyond the standard library. Hash sign selection MUST be deterministic and MUST use a valid bit mask or equivalent stable parity operation.
(Previously: default hashing behavior was required, but sign-bit validity was not specified.)

#### Scenario: Default hashing embedder is registered

- GIVEN a fresh process with no custom embedder installed
- WHEN the registry resolves `id = "hashing"`
- THEN it MUST return the default hashing implementation
- AND the implementation MUST report a fixed positive `dimensions` value (default `64`).

#### Scenario: Hashing output is L2-normalized

- GIVEN the default hashing embedder and any non-empty input
- WHEN `embed` runs
- THEN the returned vector MUST be L2-normalized
- AND the Euclidean norm MUST equal `1` within a fixed tolerance.

#### Scenario: Hash sign uses valid deterministic parity

- GIVEN the default hashing embedder and a stable token set
- WHEN `embed` runs in separate processes
- THEN each token's positive or negative contribution MUST be identical
- AND the implementation MUST NOT rely on an invalid or always-zero sign mask.
