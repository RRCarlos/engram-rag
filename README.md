# engram-rag

> Verifiable knowledge retrieval for agents. Phase 1 contract: a topic
> policy, a `KnowledgeRecord` schema, validated failure fixtures, and a
> deterministic retrieval planner — all enforced by tests, with no
> runtime dependency on Engram.

## What this is

`engram-rag` v2 is a contract-first system that prevents the drift and
unverifiable closure patterns that hit the v1 close-out. Phase 1 ships
the smallest useful slice: a single canonical topic key, a Zod-validated
schema for knowledge records, two validated failure fixtures
(PowerShell `&&`, missing Gherkin), and a deterministic `buildRetrievalPlan`
function. The contract is enforced by Vitest, a static guardrail against
v1 topic-key aliases, and a `verify:phase1` script that writes a
machine-readable report.

## Current state

| Phase | Status | Notes |
|-------|--------|-------|
| 1. Knowledge contract + retrieval planner | Implemented (this PR) | `npm test` + `npm run verify:phase1` are green. |
| 2. Engram preflight adapter | Designed, not built | See `rag-system/v2/design.md` §4. |
| 3. Skill integration | Designed, not built | See `rag-system/v2/design.md` §5. |
| 4. Evaluation harness | Designed, not built | See `rag-system/v2/design.md` §6. |
| 5. Real API + dashboard | Designed, not built | See `rag-system/v2/design.md` §7. |

v1 artifacts live under `rag-system/fase-*/` and `rag-system/dashboard/`
for historical reference. They are read-only and must not be modified.

## Quickstart

```text
npm install
npm test
npm run verify:phase1
```

| Command | What it does |
|---------|--------------|
| `npm install` | Installs TypeScript, Vitest, Zod, and `tsx`. |
| `npm test` | Runs the full Vitest suite. Every Phase 1 task has a named test (`npm test -- <name>`). |
| `npm run verify:phase1` | Runs the suite and writes `reports/phase1/verify-report.json` with the schema from `rag-system/v2/design.md` §8. |

A phase is done when `reports/phase1/verify-report.json` exists with
`exit_code: 0` and `tests_failed: 0`. See `docs/phase1-acceptance.md`.

## Source of truth

| Document | What it covers |
|----------|----------------|
| `rag-system/v2/charter.md` | Why v2 exists, success metrics, scope. |
| `rag-system/v2/design.md` | Architecture, contracts, phase-by-phase plan, verify-report schema. |
| `rag-system/v2/tasks.md` | The 12 atomic tasks that make up Phase 1, with dependencies. |
| `docs/phase1-acceptance.md` | The acceptance gates for closing Phase 1. |
| `docs/evidence/v1-forensics.md` | Historical evidence of v1's closure gaps (the only place v1 topic-key aliases are allowed). |
| `reports/phase1/verify-report.json` | Machine-readable proof that Phase 1 is green. |

## Key contracts

| Module | Purpose |
|--------|---------|
| `src/contracts/topicKeys.ts` | `CANONICAL_PROTOCOL_TOPIC_KEY = "engram-rag/agent-rigor-protocol/v2"` and the forbidden v1 alias list. |
| `src/contracts/knowledgeRecord.ts` | Zod schema for a `KnowledgeRecord` (strict mode). |
| `src/contracts/retrieval.ts` | Zod schemas for `RetrievalRequest` and `RetrievalPlan`. |
| `src/retrieval/retrievalPlan.ts` | `buildRetrievalPlan(request)` — pure, deterministic, no Engram calls. |
| `src/cli/verifyPhase1.ts` | `npm run verify:phase1` entry point. |

## Guardrails

| Test | What it stops |
|------|---------------|
| `test/guardrails/noLegacyTopicKeys.test.ts` | A v1 alias (`protocol/rigor`, `pattern/agent-rigor-protocol`, `sdd/engram-rag-fase-2/*`, etc.) sneaking into active code, fixtures, or skill blocks. |
| `test/docs/phase1-acceptance.test.ts` | Phase 1 being declared "done" without a passing verify report. |

## CI

`.github/workflows/ci.yml` runs `npm ci`, `npm test`, and
`npm run verify:phase1` on every push to `main` and on every pull
request. A merge to `main` requires CI to be green.

## Layout

```text
.
├── src/
│   ├── contracts/         # Zod schemas and topic key policy
│   ├── retrieval/         # buildRetrievalPlan()
│   └── cli/               # verifyPhase1.ts
├── test/                  # Vitest tests, mirrors src/
├── fixtures/knowledge/    # Validated failure records
├── docs/
│   ├── evidence/          # v1 forensic baseline
│   └── phase1-acceptance.md
├── reports/phase1/        # verify-report.json lives here
├── rag-system/
│   ├── v2/                # Charter, design, tasks
│   ├── fase-2/            # v1 read-only
│   ├── fase-final/        # v1 read-only
│   ├── dashboard/         # v1 read-only (do not modify)
│   ├── charter.md         # v1 read-only
│   ├── fase-2-proposal.md # v1 read-only
│   └── CONTINUITY_PROMPT.md # v1 read-only
└── .github/workflows/     # CI
```
