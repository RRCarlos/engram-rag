# Design: Agent Error Learning Loop

## Technical Approach

Deliver a contract-first operational memory loop before any broader document-RAG cleanup. PR 1 must close the mandatory path: a PowerShell `&&` preflight consult retrieves Engram observation `#152`, quarantines unrelated legacy-alias records, and emits `cmd1; if ($?) { cmd2 }`. Later slices add typed enforcement, operational MCP tools, traces/metrics, verification/docs, then secondary document-RAG fixes.

## Architecture Decisions

| Area | Decision | Tradeoff / Rationale |
|---|---|---|
| P0 sequencing | Fix resilient consult for `#152` first. | If this does not pass, MCP/tools/RAG improvements are decoration. Keeps first PR small and objectively verifiable. |
| Legacy hits | Quarantine per observation instead of throwing per search. | Preserves valid hits while still reporting invalid records for audit. Tests must build forbidden alias literals dynamically to avoid guardrail failures. |
| Enforcement | Add typed `PreflightEnforcement` beside `PreflightResult`. | Callers stop parsing prose; shell/write can block or return a correction. |
| MCP boundary | Add operational tools without removing document-RAG tools. | Avoids breaking existing `rag_query`/`rag_ingest`; docs must make the two surfaces explicit. |
| Rollout | Stacked-to-main slices under 400 changed lines. | Protects review load and lets each slice roll back independently. |

## Data Flow

```text
RetrievalRequest
  -> buildRetrievalPlan
  -> Engram adapter search/get
       -> valid records -> applied rules + consulted_ids
       -> invalid records -> quarantined_records
  -> enforcement engine
       -> allow | correct | blocked
  -> CLI/MCP JSON + trace
```

Document RAG remains separate: `rag_*` tools continue to operate on corpora; operational tools use Engram memories.

## File Changes

| File | Action | Description |
|---|---|---|
| `src/engram/liveEngramAdapter.ts` | Modify | Return valid search/get records while collecting quarantined invalid observations; preserve `#152`. |
| `src/engram/runPreflight.ts` | Modify | Include consulted IDs, quarantined records, correction candidates, missing expected records, and enforcement input. |
| `src/engram/enforcement.ts` | Create | Pure typed enforcement: unsafe degraded/missing states block; PowerShell `&&` returns corrected command. |
| `src/cli/preflightLive.ts` | Modify | Project JSON with IDs, quarantines, enforcement outcome, correction, and trace ID. |
| `src/engram/EngramTools.ts` | Modify | Add operational consult/learn contract types without coupling to MCP SDK. |
| `src/mcp/ragServer.ts` | Modify | List and dispatch operational consult/apply/learn/stats tools next to existing document-RAG tools. |
| `src/engram/trace.ts` | Create | Deterministic trace record helpers for consult/apply outcomes. |
| `src/eval/*`, `fixtures/knowledge/*`, `test/**` | Modify/Create | Fake poisoned-alias parity, P0 regression, enforcement, MCP, metrics, and document-RAG cleanup tests. |
| `src/rag/chunker.ts`, `src/rag/semanticRetriever.ts`, `src/rag/embedder/hashingEmbedder.ts`, `src/rag/graphIndex/*` | Modify | Secondary cleanup after P0: token chunking, config/hash correctness, corpus-derived graph, valid hash sign. |
| `README.md`, `.github/workflows/ci.yml`, `package.json` | Modify | Stable verify commands and current operational-vs-document guidance. |

## Interfaces / Contracts

```ts
type QuarantinedRecord = { id: number; reason: string; source: "search" | "get" };
type EnforcementOutcome = "allow" | "correct" | "blocked";
type PreflightEnforcement = {
  outcome: EnforcementOutcome;
  reason: string;
  corrected_command?: string;
  consulted_ids: number[];
  missing_expected_records: string[];
  quarantined_records: QuarantinedRecord[];
  trace_id: string;
};
```

Operational MCP tools must return the same enforcement projection: `operational_consult`, `operational_apply`, `operational_learn`, `operational_stats`.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Quarantine mapping, enforcement, trace creation, hash/chunk/graph fixes. | Vitest pure tests with fake records and constructed forbidden aliases. |
| Integration | `preflightLive` fake/live-like poisoned search includes `#152` and correction. | HTTP mock plus fake adapter; optional live smoke only outside required CI. |
| MCP | Operational tools use Engram contracts, document-RAG tools still work. | Handler-level tests; keep no-live-MCP guardrail. |
| Verification | Stable local/CI commands. | `npm test`, `npm run test:verify`, phase verifies, `npx tsc --noEmit`. |

## Delivery / PR Boundaries

1. PR1: resilient consult + `#152` PowerShell regression.
2. PR2: typed enforcement and CLI correction/block output.
3. PR3: operational MCP consult/apply/learn/stats.
4. PR4: trace, metrics, fake/live eval parity.
5. PR5: verification/docs/opencode guidance.
6. PR6: isolated document-RAG correctness cleanup.

## Migration / Rollout

No data migration required. Roll out by stacked PRs; each slice is reversible. Opencode enforcement should remain advisory until PR2, then shell/write callers must treat `blocked` and `correct` as hard gates. Degraded live preflight is allowed only for safe read/design inspection with recovered context; unsafe shell/write must stop.

## Risks / Handling

- Live Engram volatility: deterministic poisoned fake tests are required; live smoke is supplemental.
- Oversized changes: enforce stacked-to-main and 400-line PR budget.
- MCP confusion: keep operational tool names separate and document boundaries.

## Open Questions

- None blocking.
