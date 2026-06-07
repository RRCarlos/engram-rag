# Agent Error Learning Loop Specification

## Purpose

Define operational memory consult, correction enforcement, MCP tooling, and evidence for learned agent errors. The first acceptance path is mandatory: PowerShell `&&` MUST retrieve Engram observation `#152` and produce `cmd1; if ($?) { cmd2 }`.

## Requirements

### Requirement: Resilient Operational Consult

The system MUST retrieve relevant operational memories without allowing unrelated legacy-alias records to discard valid hits.

#### Scenario: Recover PowerShell correction despite poisoned hits

- GIVEN live or fake Engram contains observation `#152` and unrelated legacy-alias hits
- WHEN preflight consults for a PowerShell command containing `&&`
- THEN consulted memory IDs MUST include `152`
- AND the result MUST include the correction rule `cmd1; if ($?) { cmd2 }`.

#### Scenario: Quarantine invalid records

- GIVEN a search result contains records that cannot be mapped safely
- WHEN consult processes the result set
- THEN invalid records MUST be reported as quarantined
- AND valid records MUST remain eligible for applied rules.

### Requirement: Unsafe Action Enforcement

The system MUST emit a typed enforcement result before shell or write actions whose task has correction rules, missing expected records, or degraded retrieval.

#### Scenario: Correct PowerShell before shell execution

- GIVEN action `shell`, shell `powershell`, and command `cmd1 && cmd2`
- WHEN preflight has consulted observation `#152`
- THEN enforcement MUST block the original command
- AND MUST return corrected command `cmd1; if ($?) { cmd2 }`.

#### Scenario: Stop unsafe degraded preflight

- GIVEN action `shell` or `write` and expected records are missing
- WHEN retrieval is degraded
- THEN enforcement MUST return `blocked`
- AND MUST name the missing expected records.

### Requirement: Operational MCP Tools

The system MUST expose operational MCP tools for consult, apply, learn, and stats without replacing document-RAG tools.

#### Scenario: Consult uses Engram memories

- GIVEN an MCP client requests operational consult for a risky action
- WHEN the tool runs
- THEN results MUST include consulted memory IDs, applied rules, degraded status, and missing expected records.

#### Scenario: Learn records reusable error knowledge

- GIVEN an MCP client submits an error signature, correction, and validation status
- WHEN the learning tool succeeds
- THEN the saved memory MUST be queryable by future operational consults.

### Requirement: Traceability and Eval Parity

The system MUST trace consult/apply decisions and evaluate both deterministic fake data and optional live Engram behavior.

#### Scenario: Trace correction application

- GIVEN a consult result is applied to an action
- WHEN enforcement returns a correction or block
- THEN the trace MUST include trace ID, consulted IDs, applied rule text, outcome, degraded flag, and missing records.

#### Scenario: Fake eval mirrors live failure mode

- GIVEN fake eval includes `#152` plus poisoned legacy-alias records
- WHEN the eval runs
- THEN it MUST pass only if `#152` is consulted and the PowerShell correction is emitted.

### Requirement: Verification and Documentation Gates

The system MUST provide stable verification and current docs for the operational loop.

#### Scenario: Stable verify commands

- GIVEN CI or local verification runs
- WHEN operational-loop checks execute
- THEN tests MUST avoid recursive or flaky verify invocation
- AND MUST include the P0 PowerShell acceptance path.

#### Scenario: Docs describe current boundaries

- GIVEN a maintainer reads project docs
- WHEN locating MCP and preflight guidance
- THEN docs MUST distinguish operational memory tools from document-RAG tools
- AND include Windows-safe shell command guidance.
