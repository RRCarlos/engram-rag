## Exploration: agent-error-learning-loop

### Current State
`engram-rag` has two partially overlapping systems:

- A contract-first Engram preflight path (`src/retrieval/retrievalPlan.ts`, `src/engram/*`, `src/cli/preflightLive.ts`) that can search Engram operational memories before agent actions, but enforcement still depends on textual skill instructions and degraded output is easy to ignore.
- A document RAG MCP server (`src/mcp/ragServer.ts`) exposing `rag_query`, `rag_ingest`, `rag_eval`, and `rag_stats` over `fixtures/corpus`, not operational Engram error memories.

The concrete failure to close is: `PowerShell &&` must retrieve Engram observation `#152`, produce the corrected command rule (`cmd1; if ($?) { cmd2 }`), and block or force correction before execution. Today, live preflight returned `degraded: true` with `missing_expected_records: ["powershell"]` even though `#152` exists. The likely immediate root is `src/engram/liveEngramAdapter.ts`: `mem_search` throws when any returned observation maps to a forbidden legacy alias, so one bad legacy result can discard all valid hits for that search. `runPreflight` then marks degraded and continues without the expected PowerShell record.

### Affected Areas
- `src/engram/liveEngramAdapter.ts` — currently fails the whole search/get path on forbidden legacy aliases; needs per-record quarantine, resilient mapping, direct observation recovery, and traceability.
- `src/engram/runPreflight.ts` — currently aggregates records/rules but does not enforce correction, preserve consult/apply trace, or emit actionable failure details.
- `src/cli/preflightLive.ts` — live boundary should expose enough JSON to prove `#152` was consulted and which correction must be applied.
- `src/retrieval/retrievalPlan.ts` — trigger planning is static and misses learned operational failures beyond a small hard-coded set.
- `src/mcp/ragServer.ts` — MCP surface is document-RAG only; it does not expose agent error-learning tools or Engram operational memory actions.
- `src/engram/EngramTools.ts` — contract only covers context/search/get/save; no typed `error_learn`, enforcement result, or trace record contract.
- `fixtures/knowledge/*.json`, `eval/scenarios/*.json`, `reports/phase4/eval-report.json` — fake eval is useful for contract checks but too optimistic compared with the live #152 failure.
- `src/cli/patchLiveSkills.ts`, `src/skills/renderRagBlock.ts`, `src/skills/verifySkill.ts` — skill integration inserts instructions, but does not create automatic enforcement.
- `package.json`, `.github/workflows/ci.yml` — verification commands exist, but `npm run test:verify` runs multiple verify tests in one Vitest process and is known flaky/recursive.
- `README.md` — stale Phase 1 framing does not describe the current MCP/document-RAG and preflight/live reality.
- `src/rag/*` — secondary cleanup: `rag_ingest` schema says token chunking but code uses `maxCharacters`; graph dictionary is fixture-centric; `computeCorpusHash` hashes only chunk IDs; hashing embedder uses a broken sign bit expression.

### Approaches
1. **Patch symptoms only** — make `liveEngramAdapter.mem_search` skip forbidden legacy alias records instead of throwing, then add a regression for `#152`.
   - Pros: Fastest path to make the known PowerShell lookup work.
   - Cons: Still leaves enforcement textual, no MCP error-learning loop, no traceability, weak metrics.
   - Effort: Low

2. **Build a real operational error-learning loop** — split operational memory retrieval/enforcement from document RAG; add resilient live retrieval, `error_learn`, consult/apply trace, correction gates, and live/fake eval that proves the PowerShell case end-to-end.
   - Pros: Fixes the central defect instead of decorating it; gives acceptance evidence for `PowerShell && -> #152 -> corrected command` and future learned failures.
   - Cons: Larger change; needs stacked PRs and careful guardrails around legacy topics and live Engram variability.
   - Effort: High

3. **Replace document RAG MCP with Engram operational MCP** — pivot `ragServer.ts` entirely to operational memory tools.
   - Pros: Aligns MCP name with the desired agent-loop purpose.
   - Cons: Breaks existing document RAG behavior/specs and mixes a major product direction change into the bug fix.
   - Effort: High

### Recommendation
Use Approach 2 with stacked-to-main delivery. The first slice must close the concrete defect: resilient live preflight MUST retrieve/use `#152` for PowerShell `&&` despite unrelated legacy alias records. Only after that should MCP error-learning tools, traceability, metrics, stale docs, and document-RAG cleanups be layered on. Approach 1 is acceptable only as the first PR in the stack, not as the whole change.

### Recommended Phases / Issue Boundaries

| Phase | Issue title | Priority | Depends on | Acceptance gates |
|---|---|---:|---|---|
| 1 | fix(preflight): recover PowerShell `&&` memory despite legacy alias search hits | P0 | none | Live/fake regression proves `PowerShell && -> observation #152 -> corrected command`; search skips/quarantines forbidden legacy records without dropping valid hits; degraded is false when #152 is reachable; JSON names consulted observation IDs and applied correction. |
| 2 | feat(preflight): enforce correction before shell/write actions | P0 | Phase 1 | Preflight result has typed enforcement outcome; PowerShell `&&` returns block/correct instruction; shell action cannot proceed silently when expected records are missing or degraded; tests cover degraded stop behavior. |
| 3 | feat(mcp): expose operational error-learning tools separate from document RAG | P1 | Phase 1 | MCP lists operational tools (e.g. consult/apply/error_learn/stats) without removing document RAG unless explicitly deprecated; tools use Engram operational memories, not `fixtures/corpus`; contracts and tests prove no fixture-only success path. |
| 4 | feat(metrics): add feedback, traceability, and live/fake eval parity | P1 | Phases 1-3 | Every consult/apply records trace IDs, consulted memory IDs, outcome, and missing/degraded status; eval includes live-like poisoned legacy alias scenario; metrics expose false-negative, degraded, and correction-applied counts. |
| 5 | chore(verification-docs): stabilize verification and update docs/config | P2 | Phases 1-4 | `npm run test:verify` no longer runs recursive/concurrent flaky verify tests; CI uses stable commands; README describes current system; OpenCode MCP command guidance avoids Windows `cmd /c` pitfalls. |
| 6 | chore(document-rag): fix secondary RAG correctness debt | P2 | can run after Phase 1 | `rag_ingest` schema matches chunker API; graph dictionary is corpus-derived/configured; hashing sign bit is valid; `computeCorpusHash` includes chunk content/config; document RAG tests remain green. |

### Review Workload Forecast
- Forecast: High; this exceeds the 400 changed-line review budget if implemented as one PR.
- Chained PRs recommended: Yes.
- Chain strategy: stacked-to-main, 5-6 slices matching the phases above.
- Estimated review load:
  - PR 1: ~250-350 changed lines, focused on resilient live preflight and #152 regression.
  - PR 2: ~250-400 changed lines, enforcement contract and shell correction gates.
  - PR 3: ~300-400 changed lines, MCP operational tools and schemas.
  - PR 4: ~250-400 changed lines, trace/metrics/eval parity.
  - PR 5: ~150-300 changed lines, verification/docs/config stabilization.
  - PR 6: ~250-400 changed lines, secondary document-RAG fixes.

### Risks
- Live Engram responses may contain historical observations with forbidden aliases; throwing on them creates false negatives. Quarantine must be explicit and auditable.
- Directly citing the forbidden alias literal in active files can fail `noLegacyTopicKeys`; tests should construct it dynamically when needed.
- Enforcement cannot rely on agent compliance with markdown instructions; it needs a typed result that callers must handle.
- Live eval can be flaky if it depends on mutable external Engram state; keep deterministic fake poisoned-alias tests plus optional live smoke.
- MCP behavior change can confuse document RAG users if operational tools are not clearly separated from `rag_query`/`rag_ingest`.
- Verification changes may expose existing TypeScript/test debt; keep stabilization as a separate slice.

### Ready for Proposal
Yes. The proposal should make the P0 acceptance gate explicit: if `PowerShell && -> #152 -> corrected command` does not pass end-to-end, the change is not complete.
