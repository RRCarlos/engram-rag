# engram-rag

> Verifiable knowledge retrieval for agents. Phase 1-4 are implemented;
> the `agent-error-learning-loop` change (PR1-PR4 verified, PR5 in
> flight) layers an operational preflight + enforcement + MCP tooling
> loop on top of the document RAG system. A single
> `npm run verify:all` proves the whole learning loop is healthy.

## What this is

`engram-rag` v2 is a contract-first system that prevents the drift and
unverifiable closure patterns that hit the v1 close-out. It ships two
distinct surfaces:

1. **Document RAG** — a topic policy, a `KnowledgeRecord` schema, validated
   failure fixtures, a deterministic `buildRetrievalPlan`, hybrid /
   semantic / graph / lexical retrieval, and an `eval/` harness. Lives
   under `src/rag/`, `src/retrieval/`, `src/contracts/`. Exposed to MCP
   clients as the four `rag_*` tools.
2. **Operational error-learning loop** — resilient Engram consult,
   typed correction/block enforcement, persistent operational metrics,
   fake/live eval parity, and an MCP surface of `error_*` tools that
   consults and writes Engram memories (NOT a corpus). Lives under
   `src/engram/`, `src/mcp/operationalTools.ts`, `src/mcp/operationalMetrics.ts`,
   `src/cli/preflight*.ts`, `src/cli/mcpSmoke.ts`, `src/cli/verifyAll.ts`.

The two surfaces are wired into the same MCP server (`src/mcp/ragServer.ts`)
but are **contractually separate**: the operational layer never calls
the `rag_*` surface, and the `mcp:smoke` script enforces this with a
static scan. The unified `verify:all` entry point runs the focused
tests, the static guardrails, the typecheck, and the `mcp:smoke` check
in one go.

## Phase status

| Phase | Status | Notes |
|-------|--------|-------|
| 1. Knowledge contract + retrieval planner | Implemented ([PR #1](https://github.com/RRCarlos/engram-rag/pull/1)) | `npm test` + `npm run verify:phase1` are green. |
| 2. Engram preflight adapter | Implemented (PR1+PR2 of `agent-error-learning-loop`) | Live + fake adapter, `runPreflight`, typed enforcement, `preflightLive` CLI. |
| 3. Skill integration | Implemented | `installSkills`, `patchLiveSkills` are green. |
| 4. Evaluation harness + persistence | Implemented (PR3+PR4 of `agent-error-learning-loop`) | `scripts/eval-fake-vs-live.ts`, persistent `OperationalMetricsState`, stable trace IDs. |
| 5. Verification gates + docs | Implemented (PR5 / #31) | `verify:all`, `mcp:smoke`, cross-platform launcher, this README. |
| 6. Document-RAG correctness cleanup | Not started (out of scope for PR5) | Tracked under issue #32. |

v1 artifacts live under `rag-system/fase-*/` and `rag-system/dashboard/`
for historical reference. They are read-only and must not be modified.

## Quickstart

```text
npm install
npm test
npm run verify:all
```

| Command | What it does |
|---------|--------------|
| `npm install` | Installs TypeScript, Vitest, Zod, and `tsx`. |
| `npm test` | Runs the full Vitest suite. |
| `npm run verify:all` | **The single source of truth for the operational loop.** Runs the focused test files, the static guardrails, `npx tsc --noEmit`, and the `mcp:smoke` check. Writes `reports/verify-all/verify-report.json` and exits non-zero on any failure. |
| `npm run mcp:smoke` | Pure-data MCP smoke (tool list, no-rag_* guard, cross-platform launcher). Exit 0 means the surface is healthy. |
| `npm run verify:phase1` .. `verify:phase4` | Phase-specific verify scripts. Kept for backward compatibility; their content is a subset of `verify:all`. |

A loop is green when `verify:all` exits 0 AND `reports/verify-all/verify-report.json`
has `exit_code: 0`, `tests_failed: 0`, and `mcp_smoke.exit_code: 0`.

## Exit code matrix

The preflight CLIs, the unified `verify:all`, and the `mcp:smoke` script
share a stable exit code matrix:

| Exit | Meaning | When |
|------|---------|------|
| **0** | `allow` | Clean preflight, action permitted. All checks in `verify:all` passed. |
| **1** | Invalid flags | Unrecognized CLI argument, missing required value, usage error. |
| **2** | Degraded safe | Preflight was degraded on a **safe** action (read / spec / design / review) — proceed but know context may be incomplete. |
| **3** | Transport | Engram unreachable, task file missing, broken toolchain, MCP smoke I/O error, uncaught exception in a subprocess. |
| **4** | `correct` / `blocked` | Preflight enforcement returned a correction (run `corrected_command`) or a block (do not run the original). This is the P0 acceptance exit for `PowerShell && -> Engram #152 -> cmd1; if ($?) { cmd2 }`. |
| **5** | Internal | Reserved for future uncaught-internal-error surfacing. Not currently emitted by any CLI; documented here so the matrix is complete and future contributors do not collide. |

`verify:all` only emits 0 / 1 / 2 / 3; it never emits 4 (a `correct` /
`blocked` outcome from the live P0 smoke is recorded in the report
but does not fail the gate — the focused tests already pin that path).

## MCP surface

The MCP server (`src/mcp/ragServer.ts`) exposes a 7-tool union. The
two surfaces are deliberately separate:

| Tool | Surface | What it operates on | Backed by |
|------|---------|---------------------|-----------|
| `rag_query` | Document RAG | A corpus (default `fixtures/corpus`) | `src/rag/retriever.ts`, `src/rag/hybridRetriever.ts` |
| `rag_ingest` | Document RAG | A corpus | `src/rag/semanticRetriever.ts`, `src/rag/graphIndex/store.ts` |
| `rag_eval` | Document RAG | Eval scenarios against the corpus | `src/rag/ragEval.ts` |
| `rag_stats` | Document RAG | The loaded corpus | `src/rag/corpusLoader.ts`, `src/rag/chunker.ts` |
| `error_preflight` | Operational | Engram memories (live HTTP or fake) | `src/engram/runPreflight.ts`, `src/engram/enforcement.ts` |
| `error_learn` | Operational | Engram memories | `src/engram/fakeEngramAdapter.ts` or `src/engram/liveEngramAdapter.ts` |
| `error_stats` | Operational | In-process `OperationalMetricsState` (persisted to `<cwd>/.engram/metrics.json` by default) | `src/mcp/operationalMetrics.ts` |

**Hard rule**: `error_*` tools call `mem_*` (Engram memory) only. They
never call a `rag_*` surface. The `mcp:smoke` script enforces this with
a static scan of `src/mcp/operationalTools.ts`. A regression flips
`operational_calls_rag_surface` to `true` and `mcp:smoke` exits 2.

### opencode MCP config

The recommended opencode MCP config uses the cross-platform launcher
at `bin/engram-rag-stdio.mjs`. **Do NOT** embed `cmd /c "cd <repo> && ..."`
in your MCP config — Node 24 warns loudly, paths with spaces break,
and the parent shell becomes a hidden dependency.

```jsonc
{
  "mcp": {
    "engram-rag": {
      "type": "stdio",
      "command": "node",
      "args": ["<absolute-path-to>/engram-rag/bin/engram-rag-stdio.mjs"],
      "env": {
        "ENGRAM_BASE_URL": "http://127.0.0.1:7437",
        "ENGRAM_PROJECT": "engram-rag"
      }
    }
  }
}
```

The same config works on Windows PowerShell, Windows `cmd.exe`, and
Mac/Linux `bash`/`zsh` because the launcher itself handles the spawn
with `child_process.spawn` + `args` array and `shell: false`. The
`mcp:smoke` check (`launcher:no-shell`, `launcher:no-cmd-wrap`)
guards both axes.

## The agent error-learning loop

The `agent-error-learning-loop` change ships across PR1-PR5. Each slice
is a stacked-to-main slice, verified by `npm run verify:all`.

| PR | Issue | What it does |
|----|-------|--------------|
| PR1 | #27 | Resilient Engram consult that recovers `#152` for `PowerShell &&` despite poisoned legacy-alias hits. |
| PR2 | #28 | Typed `PreflightEnforcement` (`allow` / `correct` / `blocked`) with deterministic `trace_id`. Degraded shell/write callers are hard-gated. |
| PR3 | #29 | MCP surface for the operational loop: `error_preflight`, `error_learn`, `error_stats`. The four `rag_*` tools are preserved unchanged. |
| PR4 | #30 | Persistent `OperationalMetricsState` (`<cwd>/.engram/metrics.json`), stable `stable_trace_id` invariant to live state shifts, and `scripts/eval-fake-vs-live.ts` for fake/live parity on the scenario set. |
| PR5 | #31 | This slice. Unified `verify:all`, `mcp:smoke`, cross-platform launcher, README, exit code matrix. |
| PR6 | #32 | Document-RAG correctness cleanup. Tracked but explicitly OUT of scope for PR5. |

### Live P0 closure

The hard product rule for the change is that
`PowerShell && -> Engram #152 -> cmd1; if ($?) { cmd2 }` works
end-to-end on a real Engram instance. `verify:all` exercises this only
when `ENGRAM_BASE_URL` and `ENGRAM_PROJECT` are set; CI sets neither,
so the live smoke is opt-in. The focused tests pin the engine
(`test/engram/trace.test.ts`, `test/engram/enforcement.test.ts`,
`test/engram/runPreflight.test.ts`) so the live path is exercised
before merge on every developer machine that has Engram running.

## Windows-safe shell pattern

PowerShell does not support `&&`. The standard PowerShell fix is
`cmd1; if ($?) { cmd2 }`, where `$?` is the success status of the
previous command. The Engram observation `#152` records the canonical
form. When a preflight returns `enforcement.outcome: "correct"`, the
shell caller should use the typed `corrected_command` field, not parse
prose.

```powershell
# Pre-PR1: this fails silently because PowerShell does not have &&
git add . && git commit -m "wip"

# Post-PR1: preflight consults #152, the live CLI projects
#   { "enforcement": { "outcome": "correct", "corrected_command":
#     "git add .; if ($?) { git commit -m \"wip\" }", ... } }
# The shell caller SHOULD then run corrected_command verbatim.
git add .; if ($?) { git commit -m "wip" }
```

The same pattern is used in CI recipes, in shell scripts, and in the
launcher. **Never** embed `cd <repo> &&` in an MCP config or in a
single-line PowerShell pipeline; use the launcher or the
`cmd1; if ($?) { cmd2 }` form. `verify:all` does not exercise this
directly, but the `mcp:smoke` check verifies the launcher avoids
`cmd /c` and `shell: true` so PowerShell quoting is the only
language a maintainer needs to learn.

## Source of truth

| Document | What it covers |
|----------|----------------|
| `openspec/changes/agent-error-learning-loop/proposal.md` | Why the loop exists, scope, success criteria. |
| `openspec/changes/agent-error-learning-loop/design.md` | Architecture, contracts, data flow, PR boundaries. |
| `openspec/changes/agent-error-learning-loop/tasks.md` | Atomic tasks with review workload forecast. |
| `openspec/changes/agent-error-learning-loop/apply-progress.md` | Cumulative evidence from PR1+PR2+PR3+PR4+PR5. |
| `openspec/changes/agent-error-learning-loop/specs/agent-error-learning-loop/spec.md` | Spec scenario set (Gherkin-style). |
| `rag-system/v2/charter.md` | Why v2 exists, success metrics, scope. |
| `rag-system/v2/design.md` | Phases 1-4 architecture, contracts, verify-report schema. |
| `reports/verify-all/verify-report.json` | Machine-readable proof that `verify:all` is green. |
| `scripts/eval-fake-vs-live.ts --json` | Machine-readable proof that fake/live adapters produce the same outcome on the same scenario set. |

## Key contracts

| Module | Purpose |
|--------|---------|
| `src/contracts/topicKeys.ts` | `CANONICAL_PROTOCOL_TOPIC_KEY = "engram-rag/agent-rigor-protocol/v2"` and the forbidden v1 alias list. |
| `src/contracts/knowledgeRecord.ts` | Zod schema for a `KnowledgeRecord` (strict mode). |
| `src/contracts/retrieval.ts` | Zod schemas for `RetrievalRequest` and `RetrievalPlan`. |
| `src/retrieval/retrievalPlan.ts` | `buildRetrievalPlan(request)` — pure, deterministic, no Engram calls. |
| `src/engram/enforcement.ts` | Typed `PreflightEnforcement` (`allow` / `correct` / `blocked`). |
| `src/engram/trace.ts` | Deterministic `trace_id` + `stable_trace_id`. |
| `src/mcp/operationalTools.ts` | SDK-free `error_preflight` / `error_learn` / `error_stats` handlers. |
| `src/mcp/operationalMetrics.ts` | Persistent `OperationalMetricsState` (load/save JSON on disk). |
| `src/cli/preflightLive.ts` | Live preflight CLI (exits 0/1/2/3/4 per the matrix above). |
| `src/cli/mcpSmoke.ts` | Pure-data MCP smoke (entry point for `npm run mcp:smoke`). |
| `src/cli/verifyAll.ts` | Unified entry point for `npm run verify:all`. |
| `bin/engram-rag-stdio.mjs` | Cross-platform stdio launcher for opencode / MCP clients. |

## Guardrails

| Test | What it stops |
|------|---------------|
| `test/guardrails/noLegacyTopicKeys.test.ts` | A v1 alias (`protocol/rigor`, `pattern/agent-rigor-protocol`, `sdd/engram-rag-fase-2/*`, etc.) sneaking into active code, fixtures, or skill blocks. |
| `test/guardrails/noLiveMcpInTests.test.ts` | The `@modelcontextprotocol/sdk` import leaking outside `src/mcp/ragServer.ts`. |
| `test/guardrails/engramConfigShape.test.ts` | A regression in the live adapter env-var contract. |
| `test/docs/phase1-acceptance.test.ts` | Phase 1 being declared "done" without a passing verify report. |
| `test/ci/workflow.test.ts` | A regression in the CI workflow (Node 24, phase verify order, PR5 verify:all + mcp:smoke). |
| `npm run mcp:smoke` | A regression in the 7-tool union, the no-rag_* guard, the launcher shape. |

## CI

`.github/workflows/ci.yml` runs `npm ci`, `npm test`, the unified
`npm run verify:all -- --skip-live`, `npm run mcp:smoke`, and the
Phase 1-4 verify scripts on every push to `main` and on every pull
request. A merge to `main` requires CI to be green.

## Layout

```text
.
├── src/
│   ├── contracts/         # Zod schemas and topic key policy
│   ├── retrieval/         # buildRetrievalPlan()
│   ├── rag/               # Document-RAG: hybrid/semantic/graph retriever, embedder, eval
│   ├── engram/            # Operational loop: runPreflight, enforcement, trace, fake/live adapters
│   ├── mcp/               # MCP server + operational tools + metrics persistence
│   ├── cli/               # preflight, preflightLive, mcpSmoke, verifyAll, verifyPhase1..4, eval
│   └── skills/            # installSkills, patchLiveSkills, renderRagBlock
├── test/                  # Vitest tests, mirrors src/
├── fixtures/knowledge/    # Validated failure records
├── eval/                  # Eval scenarios for the document RAG system
├── scripts/               # eval-fake-vs-live.ts (operational parity script)
├── docs/
│   ├── evidence/          # v1 forensic baseline
│   └── phaseN-acceptance.md
├── reports/
│   ├── verify-all/        # verify-report.json from `npm run verify:all`
│   └── phase1/            # verify-report.json from `npm run verify:phase1`
├── bin/
│   └── engram-rag-stdio.mjs # Cross-platform stdio launcher for opencode / MCP clients
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
