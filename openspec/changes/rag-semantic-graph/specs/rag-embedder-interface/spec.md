# Rag Embedder Interface Specification

## Purpose

Define the `Embedder` contract — a pluggable, deterministic text-to-vector interface that powers semantic retrieval. The default is a deterministic hashing embedder; the contract is the integration boundary for any future model-based adapter.

## Requirements

### Requirement: Embedder Contract

The system MUST define an `Embedder` type with:

- `id: string` — a stable, non-empty identifier
- `dimensions: number` — a positive integer fixed at construction
- `embed(text: string): number[]` — synchronous, deterministic mapping of UTF-8 text to a dense vector of length `dimensions`

Each `embed` call MUST return a new array. The contract MUST be expressible as a Zod-style schema so registrations are validated at the boundary.

#### Scenario: Expose id and dimensions

- GIVEN an `Embedder` instance
- WHEN the consumer reads `id` and `dimensions`
- THEN `id` MUST be a non-empty string
- AND `dimensions` MUST be a positive integer.

#### Scenario: Return dense vector of declared length

- GIVEN an `Embedder` with `dimensions = D`
- WHEN `embed(text)` runs for any UTF-8 string
- THEN the returned array MUST have length exactly `D`
- AND every element MUST be a finite number.

#### Scenario: Reject mismatched dimensions

- GIVEN a candidate whose `embed` returns length `D` but declares `dimensions = D'` with `D !== D'`
- WHEN the registry validates it
- THEN validation MUST fail with a structured error
- AND the candidate MUST NOT be registered.

### Requirement: Deterministic Embedding Behavior

The contract MUST guarantee that identical input on the same `Embedder` (or a fresh instance with the same `id` and `dimensions`) produces element-wise equal vectors. Wall-clock time, process identity, and external network calls MUST NOT influence the output.

#### Scenario: Same input yields same vector

- GIVEN the same `Embedder` instance and the same input string
- WHEN `embed` is invoked repeatedly
- THEN every returned vector MUST be element-wise equal
- AND this MUST hold across separate processes with the same `id` and `dimensions`.

#### Scenario: Different inputs yield different vectors

- GIVEN two distinct non-empty UTF-8 strings
- WHEN `embed` runs for each on the same `Embedder`
- THEN the returned vectors MUST NOT be element-wise equal.

### Requirement: Default Hashing Implementation

The system MUST ship a default `hashing` `Embedder` whose `embed` uses a deterministic feature-hashing function over normalized tokens. The default MUST run without network access, provider secrets, or runtime dependencies beyond the standard library.

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

### Requirement: Pluggable Embedder Registration

The system MUST expose a registration boundary that allows a custom `Embedder` to be installed under a unique `id`. Registered embedders MUST be retrievable by `id` and MUST be validated against the contract before use.

#### Scenario: Register and resolve a custom embedder

- GIVEN a valid `Embedder` with `id = "my-embedder"`
- WHEN it is registered
- THEN resolving `id = "my-embedder"` MUST return that exact instance
- AND subsequent `embed` calls MUST use the registered implementation.

#### Scenario: Reject duplicate id registration

- GIVEN an `Embedder` already registered under `id = "x"`
- WHEN a second embedder is registered with the same `id`
- THEN registration MUST fail with a structured error
- AND the original implementation MUST remain active.

#### Scenario: Resolve unknown id fails loudly

- GIVEN no embedder registered under `id = "missing"`
- WHEN the registry resolves `id = "missing"`
- THEN resolution MUST fail with a structured error naming the missing id
- AND no fallback embedder MUST be silently substituted.
