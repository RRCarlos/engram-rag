# v1 Forensics — Engram RAG closure without evidence

> **Historical evidence — DO NOT cite as live contract.**
> This document is the forensic baseline that motivated the v2 redesign.
> It is intentionally preserved verbatim and is the ONLY place where v1
> topic key aliases are allowed to appear. See `src/contracts/topicKeys.ts`
> for the live policy.

## Why this document exists

The v1 close-out report (`rag-system/fase-final/CIERRE-FASES.md`) declared 8
phases complete and a fully operational system. Engram observation `#728`
(`engram-rag/repo-state-2026-06-05`) showed the opposite: the repository
shipped Markdown narrative but no executable contract, no tests, no
running API, and a dashboard built from hardcoded literals.

Phase 1 of v2 cites this gap as the reason every phase must close with
`npm test` + a `verify-report.json`. This file is the reference for that
decision and the canonical place to point at v1 evidence.

## Cross-references

| v1 artifact | Path | Why cited |
|-------------|------|-----------|
| Cierre de fases (resumen) | `rag-system/fase-final/CIERRE-FASES.md:3-7` | Self-attested closure with no `verify-report.json` and no tests. |
| Cierre de fases (conclusion) | `rag-system/fase-final/CIERRE-FASES.md:69-87` | "Sistema operativo" claim with no executable evidence attached. |
| Promised API | `rag-system/fase-final/CIERRE-FASES.md:45-52` | Claims `api/server.js` exists; file does not. |
| Dashboard hardcoded data | `rag-system/dashboard/app.js:4-30` | `engramData` is a JS literal, not a `fetch()` result. |
| Simulated refresh | `rag-system/dashboard/app.js:79-90` | `setTimeout` instead of real network call. |
| Dashboard README | `rag-system/dashboard/README.md:21-25`, `:40-55` | Admits simulated data; contradicts "API Real" claim. |
| Engram observation | `#728`, topic `engram-rag/repo-state-2026-06-05` | Persistent record of the gap as observed on 2026-06-05. |

## v1 topic key aliases — historical only

The v1 system used topic keys that are now FORBIDDEN in active code,
fixtures, and skill blocks. They are listed here so reviewers and
follow-on agents can recognize the v1 lineage, but they must never be
introduced in new artifacts.

| v1 alias (historical) | Where it appeared in v1 | Replacement in v2 |
|-----------------------|-------------------------|-------------------|
| `pattern/agent-rigor-protocol` | `rag-system/fase-final/CIERRE-FASES.md:11` | `engram-rag/agent-rigor-protocol/v2` |
| `sdd/engram-rag-fase-2/proposal` | `rag-system/dashboard/app.js:14` | Per-failure `engram-rag/failures/{agent_id}/{failure_slug}` referencing the canonical protocol |
| `sdd/engram-rag-fase-2/specs` | `rag-system/dashboard/app.js:15` | Same as above |
| `sdd/engram-rag-fase-2/implemented` | `rag-system/dashboard/app.js:16` | Same as above |
| `sdd/engram-rag-fase-2/verified` | `rag-system/dashboard/app.js:17` | Same as above |
| `sdd/engram-rag-fase-2/dashboard` | `rag-system/dashboard/app.js:18` | Same as above |

The v1 aliases `protocol/rigor` and `protocol/rigor/v1` did not appear
inside the v1 repo itself but were referenced in the v1 design notes; they
are also forbidden in v2 to keep the topic space consistent.

## What v2 changes

| v1 weakness | v2 Phase 1 fix |
|-------------|----------------|
| Closure without test command | Every task has `npm test -- <name>` acceptance gate. |
| Dashboard built before API | Phase 1 ships no dashboard; Phase 5 forbids hardcoded literals. |
| Multiple incompatible topic keys | One canonical key + `forbidden_topic_aliases` enforced by guardrail test. |
| No `verify-report.json` | `src/cli/verifyPhase1.ts` writes `reports/phase1/verify-report.json` on success. |
| No CI | `.github/workflows/ci.yml` runs `npm ci` and `npm test`. |

## Status

This file is **frozen** as historical evidence. Edits are only permitted
to add new evidence rows; they must not soften or remove the v1 gaps
documented above.
