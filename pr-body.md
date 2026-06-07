## Summary
Implements the complete operational error learning loop for engram-rag v2, enabling sub-agents to actually learn from operational failures end-to-end.

## Hard P0 Closure
**`PowerShell && -> Engram #152 -> cmd1; if ($?) { cmd2 }`** — proven live in every phase.

## Stacked Slices (merged as single PR due to file overlap)

| Slice | Issue | Scope | Verified |
|-------|-------|-------|----------|
| PR1 | #27 | `fix(preflight): recover PowerShell memory despite legacy hits` | ✅ PASS |
| PR2 | #28 | `feat(preflight): enforce correction before shell/write actions` | ✅ PASS |
| PR3 | #29 | `feat(mcp): expose operational error-learning tools` | ✅ PASS |
| PR4 | #30 | `feat(observability): stable trace ids, persistent metrics, fake/live eval parity` | ✅ PASS |
| PR5 | #31 | `chore(verify): verification gates, README MCP boundary, Windows-safe shell, opencode launcher` | ✅ PASS |

## Key Deliverables
- **Resilient consult**: Live preflight recovers valid memory `#152` even when search hits legacy/forbidden aliases (quarantines `#144` per-record, no abort)
- **Typed enforcement**: `PreflightEnforcement` with `allow|correct|blocked` outcomes; PowerShell `&&` rewritten to `cmd1; if ($?) { cmd2 }`; exit code 4 for correct/blocked
- **Operational MCP surface**: `error_preflight`, `error_learn`, `error_stats` reusing CLI engine (no drift)
- **Stable traces**: `stable_trace_id` invariant to live state shifts (sha256 over project+agent+action+sorted signatures+protocol)
- **Persistent metrics**: `preflight_coverage`, `retrieval_hit_rate`, `application_rate`, `repeat_error_rate`, `prevention_rate` survive process restart
- **Fake/live eval parity**: 5/5 scenarios match outcomes and stable traces
- **Verification gates**: `npm run verify:all` (focused+guardrails+typecheck+mcp:smoke), `npm run mcp:smoke` (11 checks), cross-platform launcher
- **Windows-safe**: `bin/engram-rag-stdio.mjs` uses `spawn` + args array + `shell:false`

## Verification Evidence
```
npm test                    → 763 passed, 1 skipped
npm run verify:all --skip-live → 4/4 checks pass (124 focused + 255 guardrails + tsc + mcp:smoke)
npm run mcp:smoke           → 11/11 checks pass
npx tsc --noEmit            → clean
Live P0 smoke               → outcome:correct, corrected_command:"cmd1; if ($?) { cmd2 }", exit 4
```

## Follow-up
PR6/#32 (`chore(rag): document-RAG correctness cleanup`) remains as independent follow-up for the document-RAG engine (`rag_query|rag_ingest|rag_eval|rag_stats`).