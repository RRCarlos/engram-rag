# Proposal: Agent Error Learning Loop

## Intent

Close the concrete failure: `PowerShell && -> Engram #152 -> cmd1; if ($?) { cmd2 }`. If this path fails, the change fails.

## Scope

### In Scope
- Resilient live Engram retrieval: quarantine legacy-alias hits without dropping valid hits.
- Typed correction/enforcement with consulted IDs and rule text.
- Operational MCP/tools, trace, metrics, and fake/live eval parity.
- Verification/docs; document-RAG cleanup only after P0 is green.

### Out of Scope
- Abstract RAG quality work not proving #152.
- Replacing document RAG MCP behavior.
- Markdown-only enforcement.

## Capabilities

### New Capabilities
- `agent-error-learning-loop`: operational consult, enforcement, learning, traceability, metrics.

### Modified Capabilities
- `rag-document-retrieval`: secondary cleanup; keep separate from operational tools.
- `rag-embedder-interface`: hashing fix only if required by cleanup.

## Approach

Deliver stacked-to-main. PR 1 MUST retrieve #152 and emit the corrected PowerShell command despite legacy hits. Later slices add enforcement, MCP tools, trace/metrics, docs/verification, and document-RAG cleanup.

## Phases / Issue Boundaries

| Phase | Issue | Gate |
|---|---|---|
| 1 | `fix(preflight): recover PowerShell && memory despite legacy hits` | #152 consulted; corrected command; not degraded when reachable. |
| 2 | `feat(preflight): enforce correction before shell/write actions` | typed block/correction; degraded expected records stop unsafe execution. |
| 3 | `feat(mcp): expose operational error-learning tools` | uses Engram memories, not fixtures; document RAG preserved. |
| 4 | `feat(metrics): add traces and eval parity` | trace IDs, memory IDs, degraded/missing status, counts. |
| 5 | `chore(verification-docs): stabilize verify commands and docs` | stable CI/verify; README current. |
| 6 | `chore(document-rag): fix secondary retrieval correctness debt` | chunking/hash/graph/embedder fixes isolated. |

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `src/engram/*`, `src/retrieval/*`, `src/cli/preflightLive.ts` | Modified | consult/enforce |
| `src/mcp/ragServer.ts`, `src/engram/EngramTools.ts` | Modified | operational tools |
| `eval/`, `reports/`, `test/` | Modified | evidence |
| `README.md`, `.github/workflows/ci.yml`, `package.json` | Modified | docs/verify |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Live Engram volatility | High | fake poisoned-alias regression plus live smoke |
| Oversized PR | High | stacked-to-main, 400-line budget per slice |
| Legacy alias guard failures | Medium | quarantine records; build forbidden literals dynamically in tests |

## Rollback Plan

Revert the current stack slice. PR 1 is self-contained; later slices can be reverted independently.

## Dependencies

- `openspec/changes/agent-error-learning-loop/exploration.md`
- Engram observation #152.
- Approved issues before PRs.

## Success Criteria

- [ ] P0 proves `PowerShell && -> #152 -> cmd1; if ($?) { cmd2 }` end-to-end.
- [ ] Missing/degraded preflight cannot proceed silently for unsafe actions.
- [ ] Each PR forecasts the 400-line budget.
