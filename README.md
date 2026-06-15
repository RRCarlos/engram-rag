# engram-rag

> Retrieval-Augmented Generation for the Engram persistent memory system.

engram-rag is a **verifiable knowledge retrieval system** designed to give AI agents structured, typed access to past failures, operational rules, and document knowledge. It powers the Gentle AI / OpenCode ecosystem's error-learning loop, where agents consult a memory of past failures before taking actions — and record new failures to improve over time.

It runs as an MCP server and exposes 7 retrieval tools.

## Table of Contents

- [Where the idea comes from](#where-the-idea-comes-from)
- [What it solves](#what-it-solves)
- [Two surfaces](#two-surfaces)
- [Honest assessment](#honest-assessment)
- [Quickstart](#quickstart)
- [Architecture](#architecture)
- [Project layout](#project-layout)
- [Exit code matrix](#exit-code-matrix)
- [MCP surface](#mcp-surface)
- [opencode integration](#opencode-integration)
- [Windows-safe shell pattern](#windows-safe-shell-pattern)
- [Test coverage](#test-coverage)
- [CI](#ci)
- [Phase status](#phase-status)
- [Key contracts](#key-contracts)
- [Source of truth](#source-of-truth)

---

## Where the idea comes from

The project started in 2024 as a Spanish-language exploration (`rag-system/fase-2/`, `rag-system/fase-final/`) into building a RAG/KAG hybrid for Engram — modeled on ideas from Microsoft's GraphRAG and from classic lexical retrieval (BM25). That version was a proof of concept: it proved the concept was viable but the code was not production-grade.

**v2 was rebuilt from scratch** with a contract-first approach:

- Everything starts with **Zod schemas** — there's no untyped data flowing through the system
- **Deterministic retrieval** — the `buildRetrievalPlan` function is a pure function; given the same input, it always produces the same plan
- **No black-box embeddings** — the embedder system uses a hashing embedder that is deterministic and auditable
- **Phased verification** — each phase ships with a `verify:phaseN` script that proves it works

The second evolution was the **agent error-learning loop** (`agent-error-learning-loop`), which turned the document RAG system into an operational memory system for agents. Instead of retrieving from a static corpus, it consults Engram's persistent memory of past failures — and records new ones with structured metadata.

The core problem this solves is: **AI agents repeat the same mistakes** because they have no structured memory of what went wrong before. A preflight consultation prevents known failure patterns; an enforcement engine provides typed outcomes (`allow` / `correct` / `blocked`); and the operational metrics prove the system is working (or shows when it's degrading).

---

## What it solves

AI agents in the SDD workflow (proposal → specs → design → tasks → apply → verify → archive) need to:

1. **Remember past failures and corrections** — the error-learning loop consults Engram before every action and surfaces known failure patterns
2. **Retrieve relevant knowledge** — from both the document corpus (specs, docs, code) and from Engram memory (past fixes, decisions)
3. **Get deterministic, verifiable retrieval** — no opaque vector math; every retrieval step is logged and auditable
4. **Handle PowerShell safely** — the `cmd1; if ($?) { cmd2 }` pattern is the canonical fix for `&&` on Windows, and the enforcement engine provides typed `corrected_command` strings
5. **Prove it works** — every phase has a verification gate; `npm run verify:all` is the single source of truth

---

## Two surfaces

engram-rag is actually **two systems** sharing the same MCP server:

| System | What it does | Tools | Backend |
|--------|-------------|-------|---------|
| **Document RAG** | Retrieves from a structured document corpus | `rag_query`, `rag_ingest`, `rag_eval`, `rag_stats` | `src/rag/` — hybrid / semantic / lexical / graph retrieval |
| **Operational error-learning loop** | Consults and records Engram memory of past failures | `error_preflight`, `error_learn`, `error_stats` | `src/engram/` — preflight consultation, typed enforcement, operational metrics |

**Hard rule:** `error_*` tools call Engram only. They never call a `rag_*` surface. The `mcp:smoke` script enforces this with a static scan.

---

## Honest assessment

The user asked for **brutal honesty**. Here it is.

### What's solid ✅

- **Core architecture is good.** Modular, typed, testable. The separation between contracts, retrieval engine, engram adapters, MCP surface, and CLI is clean.
- **Test coverage is strong.** 65 test files for 50 source modules (~130% ratio). The graph index, embedders, retrieval pipeline, enforcement, trace system, and hybrid retriever are all tested.
- **TypeScript compiles clean.** `npx tsc --noEmit` passes with `strict: true`.
- **The MCP server works.** `npm run mcp:smoke` proves the 7-tool union is healthy and the operational surface doesn't leak into the RAG surface.
- **Design decisions are documented.** `rag-system/v2/charter.md` and `rag-system/v2/design.md` explain the why. `openspec/changes/agent-error-learning-loop/` contains the full SDD spec, design, and tasks.
- **Cross-platform is handled.** The stdio launcher avoids `cmd /c`, `shell: true`, and `&&` — it works the same on Windows, macOS, and Linux.

### What's weak or incomplete ⚠️

| Issue | Impact | Details |
|-------|--------|---------|
| **Live Engram integration is untested in CI** | Medium | The live adapter (`src/engram/liveEngramAdapter.ts`) requires `ENGRAM_BASE_URL` and `ENGRAM_PROJECT`. CI doesn't set these. The live path is exercised only on developer machines that have Engram running. |
| **`ragServer` has no dedicated tests** | Low-Medium | `src/mcp/ragServer.ts` — the MCP server entry — has no unit tests. The tools it exposes are tested individually, and `mcpSmoke` does a surface check. But if the server wiring breaks, the test suite won't catch it directly. |
| **`dashboardServer` is v1 dead code** | Low | `src/api/dashboardServer.ts` is from the v1 architecture. It has no tests, no callers in v2. It's a 236-line module that serves a stale HTML dashboard. It should either be removed or brought into v2. |
| **`verifyAll` has a Windows path quirk** | Low | The `invokedDirectly` detection in `src/cli/verifyAll.ts` constructs a `file://` URL manually. On Windows, this may produce a malformed URL depending on the Node.js version. The MCP path doesn't use this, so it only affects direct CLI invocation. |
| **`reports/verify-all/` is a generated artifact** | Low | The README lists `reports/verify-all/verify-report.json` as a "source of truth" document, but it's generated at runtime by `npm run verify:all`, not committed. The `.gitkeep` directories in `reports/phase1-4/` are vestigial. |
| **No performance benchmarks** | Low | There's no benchmark suite. A retrieval system should have p50/p95 latency benchmarks tracked over time. The eval scores exist (`top1_hit_rate`, `top3_hit_rate`) but not latency regressions. |
| **No npm audit done** | Low | Dependencies have never been audited for vulnerabilities. `npm audit` should be run and fixed. |
| **CI status unknown** | Low | `.github/workflows/ci.yml` exists but there's no badge and no evidence that it currently passes on GitHub Actions. The workflow references PR5 scripts that were recently merged. |

### Summary

The codebase is **functional and well-designed** but has **two real risks**:

1. **The live Engram integration is untested in CI.** If Engram changes its API, the live adapter will break silently. The fake adapter tests pin the expected behavior, but there's no regression detection for the live path.
2. **No one has shipped this to production.** The MCP server works (proven by `mcp:smoke`), but there's no evidence it's been wired into an agent workflow and exercised in a real edit session.

The rest of the issues are minor — dead code, stale docs, missing benchmarks.

---

## Quickstart

```bash
npm install
npm test
npm run verify:all
```

| Command | What it does |
|---------|--------------|
| `npm install` | Installs TypeScript, Vitest, Zod, and tsx. |
| `npm test` | Runs the full Vitest suite (65 test files). |
| `npm run verify:all` | **The single source of truth.** Runs focused tests, static guardrails, `npx tsc --noEmit`, and the `mcp:smoke` check. Exits non-zero on any failure. |
| `npm run mcp:smoke` | Pure-data MCP smoke (tool list, no-rag_* guard, cross-platform launcher check). |
| `npm run verify:phase1` ... `verify:phase4` | Phase-specific verify scripts (subset of `verify:all`). |

---

## Architecture

```
                          ┌──────────────────────┐
                          │     MCP Client        │
                          │  (opencode / agent)   │
                          └──────────┬───────────┘
                                     │ stdio
                          ┌──────────▼───────────┐
                          │   mcp/ragServer.ts   │
                          │    (7 tools)         │
                          └───┬─────────────┬────┘
                              │             │
                 ┌────────────▼────┐  ┌────▼────────────┐
                 │  error_* tools  │  │  rag_* tools    │
                 │  (operational)  │  │  (document RAG) │
                 └────────┬───────-┘  └────┬────────────┘
                          │                │
              ┌───────────▼──────┐   ┌─────▼──────────┐
              │  engram/         │   │  rag/           │
              │  runPreflight    │   │  retriever.ts   │
              │  enforcement     │   │  hybridRetriever│
              │  fake/live       │   │  chunker        │
              │  trace           │   │  embedder/      │
              └─────────┬───────-┘   │  graphIndex/    │
                        │            │  ragEval.ts     │
              ┌─────────▼───────┐    └─────────────────┘
              │  Engram memory  │
              │  (live HTTP or  │
              │   fake adapter) │
              └─────────────────┘
```

The two surfaces are wired into the same MCP server but are contractually separate:
- The operational layer never calls `rag_*` tools
- The document RAG never calls Engram
- `mcp:smoke` enforces this with a static scan

---

## Project layout

```
.
├── src/
│   ├── contracts/         # Zod schemas and topic key policy
│   ├── retrieval/         # buildRetrievalPlan() — pure, deterministic
│   ├── rag/               # Document RAG: hybrid/semantic/graph retrieval, embedder, eval
│   ├── engram/            # Operational loop: preflight, enforcement, trace, adapters
│   ├── mcp/               # MCP server + operational tools + metrics persistence
│   ├── cli/               # preflight, mcpSmoke, verifyAll, phase verify scripts
│   └── skills/            # installSkills, patchLiveSkills, renderRagBlock
├── test/                  # Vitest tests (65 files), mirrors src/
├── fixtures/              # Validated knowledge records and corpus documents
├── eval/                  # RAG eval scenarios (JSON fixture sets)
├── scripts/               # eval-fake-vs-live.ts — operational parity script
├── bin/
│   └── engram-rag-stdio.mjs  # Cross-platform stdio launcher
├── openspec/              # SDD artifacts (proposal, design, tasks, specs)
├── docs/                  # Phase acceptance docs, forensic evidence
├── reports/               # Generated verify reports (runtime artifacts)
├── rag-system/            # Historical v1 and v2 design documents
│   ├── v2/                # v2 charter, design, phase tasks
│   ├── fase-2/            # v1 — read only
│   ├── fase-final/        # v1 — read only
│   └── dashboard/         # v1 — read only, possibly broken
└── .github/workflows/     # CI
```

---

## Exit code matrix

The preflight CLIs, `verify:all`, and `mcp:smoke` share a stable exit code convention:

| Exit | Meaning | When |
|------|---------|------|
| **0** | `allow` | Clean preflight, action permitted. All checks in `verify:all` passed. |
| **1** | Invalid flags | Unrecognized CLI argument, missing required value. |
| **2** | Degraded safe | Preflight was degraded on a safe action (read/spec/design/review) — proceed but context may be incomplete. |
| **3** | Transport | Engram unreachable, task file missing, MCP smoke I/O error. |
| **4** | `correct` / `blocked` | Preflight enforcement returned a correction (run `corrected_command`) or a block (do not run the original). This is the P0 acceptance exit for `&&` → `cmd1; if ($?) { cmd2 }`. |
| **5** | Internal | Reserved for future use. |

`verify:all` only emits 0 / 1 / 2 / 3.

---

## MCP surface

| Tool | Surface | Operates on | Backed by |
|------|---------|-------------|-----------|
| `rag_query` | Document RAG | Corpus (default `fixtures/corpus`) | `src/rag/retriever.ts`, `src/rag/hybridRetriever.ts` |
| `rag_ingest` | Document RAG | Corpus | `src/rag/semanticRetriever.ts`, `src/rag/graphIndex/store.ts` |
| `rag_eval` | Document RAG | Eval scenarios against corpus | `src/rag/ragEval.ts` |
| `rag_stats` | Document RAG | Loaded corpus | `src/rag/corpusLoader.ts`, `src/rag/chunker.ts` |
| `error_preflight` | Operational | Engram memories (live HTTP or fake) | `src/engram/runPreflight.ts`, `src/engram/enforcement.ts` |
| `error_learn` | Operational | Engram memories | `src/engram/fakeEngramAdapter.ts` or `liveEngramAdapter.ts` |
| `error_stats` | Operational | In-process `OperationalMetricsState` | `src/mcp/operationalMetrics.ts` |

### opencode MCP config

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

Do NOT embed `cmd /c "cd <repo> && ..."` in your MCP config — Node warns loudly, paths with spaces break, and the parent shell becomes a hidden dependency. The launcher uses `child_process.spawn` with `shell: false`; it works the same on all platforms.

---

## Windows-safe shell pattern

PowerShell does not support `&&`. The standard fix is:

```powershell
cmd1; if ($?) { cmd2 }
```

When the preflight engine returns `enforcement.outcome: "correct"`, the `corrected_command` field contains the PowerShell-safe form. Never parse prose — use the typed field.

In CI recipes, in shell scripts, and in the launcher: use the `cmd1; if ($?) { cmd2 }` form. Never embed `cd <repo> &&` in a single-line PowerShell pipeline.

---

## Test coverage

65 test files across 50 source modules. Coverage by area:

| Area | Source files | Test files | Status |
|------|-------------|------------|--------|
| **Contracts** | 5 | 5 | Full |
| **Retrieval planner** | 1 | 2 | Full |
| **RAG engine** (chunker, retriever, hybrid, semantic, corpus, eval) | 10 | 11 | Full |
| **Embedder system** (registry, embedder, hashing) | 5 | 4 | Full |
| **Graph index** (extract, store, traverse) | 3 | 4 | Full |
| **Vector index** (cosine, store) | 2 | 2 | Full |
| **Engram loop** (preflight, enforcement, trace, adapters) | 7 | 15 | Full |
| **MCP tools** (operational tools, metrics) | 2 | 3 | Partial (tools tested individually; `ragServer.ts` has no test) |
| **CLI** (verifyAll, mcpSmoke, preflight) | 4 | 5 | Full |
| **Guardrails** | — | 6 | Full |
| **CI** | — | 1 | Full |
| **v1 (dashboardServer)** | 1 | 0 | None — dead code |
| **RRF** | 1 | 1 (via hybridRetriever) | Tested indirectly |

---

## CI

`.github/workflows/ci.yml` runs on push to `main` and on pull requests:

- `npm ci`
- `npm test`
- `npm run verify:all -- --skip-live`
- `npm run mcp:smoke`
- Phase 1–4 verify scripts

**Note:** The live Engram path (`--skip-live` flag means it's excluded). CI exercises the fake adapter only. If the real Engram API changes, CI won't detect it.

---

## Phase status

| Phase | What | Status | Notes |
|-------|------|--------|-------|
| **1** | Knowledge contract + retrieval planner | ✅ Implemented | `npm run verify:phase1` is green. `buildRetrievalPlan` is a pure function. |
| **2** | Engram preflight adapter + enforcement | ✅ Implemented | Fake + live adapter, `runPreflight`, typed `PreflightEnforcement`. |
| **3** | Skill integration | ✅ Implemented | `installSkills`, `patchLiveSkills` — both green. |
| **4** | Eval harness + operational metrics persistence | ✅ Implemented | `eval-fake-vs-live.ts`, persistent `OperationalMetricsState`, stable trace IDs. |
| **5** | Verification gates, MCP smoke, cross-platform launcher | ✅ Implemented | `verify:all`, `mcp:smoke`, stdio launcher, exit code matrix. |
| **6** | Document-RAG correctness cleanup | ✅ Implemented (PR6/#32) | Merged to main. The README was stale — this was marked "not started" but PR6 was merged before the last update. |

**Note on Phase 6:** The previous version of this README showed Phase 6 as "not started." That was accurate at the time of writing but PR6 was since merged. This README now reflects the current state of `main`.

---

## Key contracts

| Module | Purpose |
|--------|---------|
| `src/contracts/topicKeys.ts` | `CANONICAL_PROTOCOL_TOPIC_KEY` and the forbidden v1 alias list |
| `src/contracts/knowledgeRecord.ts` | Zod schema for `KnowledgeRecord` (strict mode) |
| `src/contracts/retrieval.ts` | Zod schemas for `RetrievalRequest` and `RetrievalPlan` |
| `src/retrieval/retrievalPlan.ts` | `buildRetrievalPlan(request)` — pure, deterministic, no I/O |
| `src/engram/enforcement.ts` | Typed `PreflightEnforcement` — `allow` / `correct` / `blocked` |
| `src/engram/trace.ts` | Deterministic `trace_id` + `stable_trace_id` |
| `src/mcp/operationalTools.ts` | SDK-free `error_preflight` / `error_learn` / `error_stats` handlers |
| `src/mcp/operationalMetrics.ts` | Persistent `OperationalMetricsState` (JSON on disk) |

---

## Source of truth

| Document | What it covers |
|----------|----------------|
| **`openspec/config.yaml`** | SDD project configuration |
| `openspec/changes/agent-error-learning-loop/proposal.md` | Why the loop exists, scope, success criteria |
| `openspec/changes/agent-error-learning-loop/design.md` | Architecture, contracts, data flow, PR boundaries |
| `openspec/changes/agent-error-learning-loop/tasks.md` | Atomic tasks with review workload forecast |
| `openspec/changes/agent-error-learning-loop/specs/agent-error-learning-loop/spec.md` | Spec scenario set (Gherkin-style) |
| `rag-system/v2/charter.md` | Why v2 exists, success metrics, scope |
| `rag-system/v2/design.md` | Phases 1–4 architecture, contracts, verify-report schema |
| `reports/verify-all/verify-report.json` | **Generated** — machine-readable proof that `verify:all` is green (run `npm run verify:all` to produce it) |
| `docs/phase1-acceptance.md` through `docs/phase5-acceptance.md` | Phase acceptance criteria |

---

## License

Unpublished work — all rights reserved.
