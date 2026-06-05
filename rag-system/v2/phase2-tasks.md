---
title: "Engram RAG v2 - Phase 2 Task Breakdown"
version: "1.0"
status: "archived"
date: "2026-06-05"
project: "engram-rag"
artifact: "phase2-tasks"
language: "es-AR"
phase: 2
phase2_status: "archived"
phase2_prs:
  - "https://github.com/RRCarlos/engram-rag/pull/3"
  - "https://github.com/RRCarlos/engram-rag/pull/4"
  - "https://github.com/RRCarlos/engram-rag/pull/5"
phase2_final_sha: "e02456d"
phase2_verdict: "PASS (207 tests, verify:phase1 OK, verify:phase2 OK, CI green)"
phase1_status_ref: "rag-system/v2/tasks.md (archived)"
change_name: "v2-phase2-engram-preflight"
feature_branch: "v2-phase2-engram-preflight"
delivery_strategy: "single-pr"
canonical_topic_key: "engram-rag/agent-rigor-protocol/v2"
---

# Phase 2: Engram preflight adapter - Task Breakdown

> Slice ejecutable de la Fase 2 descrita en `rag-system/v2/design.md` §4.
> Compone con los contratos de Phase 1 (`RetrievalRequest`,
> `RetrievalPlan`, `KnowledgeRecord`, `KnowledgeRecordSchema`,
> `defaultForbiddenTopicAliases`). NO introduce dependencias nuevas.

## 1. Alcance de Phase 2

Phase 2 entrega el adaptador de preflight contra Engram: una interface `EngramTools`, un fake adapter determinístico para CI, una función `runPreflight()` que ejecuta el plan de retrieval respetando el orden estricto `mem_context` → `mem_search` → `mem_get_observation` y maneja la indisponibilidad de Engram sin bloquear al agente (`degraded: true` con datos parciales), un CLI `engram-rag preflight` con salida JSON, y un script `verify:phase2` que emite `reports/phase2/verify-report.json` con latencia p95 ≤ 2000 ms (charter §5). NO modifica skills reales, NO crea live MCP adapter, NO toca el dashboard. Las fixtures existentes (`fixtures/knowledge/powershell-and.json` y `sdd-spec-gherkin.json`) son suficientes: la case PowerShell se valida contra `powershell-and.json` sin agregar fixtures nuevas.

## 2. Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 950-1050 (inserciones, excluyendo lockfile) |
| 400-line budget risk | **High** (~2.4×-2.6×) |
| Chained PRs recommended | No (single-pr pre-cached) |
| Suggested split | Single PR for Phase 2 |
| Delivery strategy | single-pr |
| Chain strategy | size-exception (implícito, single-pr > 400) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

**Justificación del forecast honesto**: el scaffold (`package.json`, `tsconfig.json`, `vitest.config.ts`, CI workflow) ya existe en `main` desde Phase 1. La inflación respecto al presupuesto de 400 líneas viene de los **tests exhaustivos** de los 5 AC de design §4 (orden, observación completa, fixture, latencia, degradado) + el script `verify:phase2` que es un espejo casi-completo de `verifyPhase1.ts` (~170 líneas) + el guardrail anti-MCP-live. NO es inflación de scaffold.

**Mitigación del riesgo de review**: cada task es atómica y mapea 1:1 a un commit (ver `work-unit-commits`). El reviewer puede leer el PR en orden P2-01 → P2-07 y cada commit compila + pasa tests por sí solo. Esto convierte un PR grande en 7 commits revisables linealmente.

## 3. Orden de ejecución

| ID | Descripción | Archivos | Done verificable | Tamaño | Depende de |
|----|-------------|----------|------------------|--------|------------|
| P2-01 | Definir el contrato `EngramTools` con tipos Zod para inputs/outputs de `mem_context`, `mem_search`, `mem_get_observation`, `mem_save`, más helpers `parseMemSearchInput`/`parseMemGetObservationInput`. | `src/engram/EngramTools.ts`, `test/engram/EngramTools.test.ts` | `npm test -- EngramTools` valida que cada input rechaza shapes inválidos y que los tipos exportados se importan sin colisión. | S | Phase 1 (RetrievalRequest, KnowledgeRecord) |
| P2-02 | Implementar `createFakeAdapter(records, options)` determinístico: store en memoria, call log, `mem_search` con match por `trigger_terms`/`failure_signature`/`validated_solution` (case-insensitive), `failureMode: 'throw' \| 'timeout' \| 'none'` y `latencyMs` configurable. | `src/engram/fakeEngramAdapter.ts`, `test/engram/fakeEngramAdapter.test.ts` | `npm test -- fakeEngramAdapter` valida call order, ranking de búsqueda, `failureMode: 'throw'` rechaza la promesa, `failureMode: 'timeout'` excede el timeout configurado. | M | P2-01 |
| P2-03 | Implementar `runPreflight(request, tools)` que ejecuta `buildRetrievalPlan(request)`, llama `mem_context` **antes** de `mem_search`, llama `mem_get_observation` por cada ID usado, mide `latency_ms` con `performance.now()`, expone `degraded: true` + `applied_rules`/`missing_expected_records` ante fallas parciales, y **nunca** lanza (devuelve `PreflightResult` siempre). | `src/engram/runPreflight.ts`, `test/engram/runPreflight.test.ts` | `npm test -- runPreflight` cubre los **5 AC de design §4**: (1) spy assert call order `mem_context` → `mem_search`; (2) spy assert que cada ID en `records` tuvo su `mem_get_observation`; (3) test con fixture `powershell-and.json` recupera `validated_solution` y la marca en `applied_rules`; (4) `latency_ms` es positivo y ≤ budget; (5) con `failureMode: 'throw'` solo en `mem_search` retorna `degraded: true` con `records: []` y `applied_rules: []` sin lanzar. | M | P2-02 |
| P2-04 | CLI `engram-rag preflight --project <p> --agent <a> --task-file <path> [--json]` con parsing manual de argv (sin libs), lectura del `task-file`, invocación de `runPreflight` con un fake adapter cargado desde `fixtures/knowledge/*.json`, salida pretty por defecto o JSON con `--json`, y exit codes estables: `0` OK, `1` flags inválidos, `2` adapter error, `3` schema inválido. | `src/cli/preflight.ts`, `test/cli/preflight.test.ts` | `npm test -- preflight` verifica cada flag individual, exit 0 con `--json` y shape `{ request, records, applied_rules, missing_expected_records, latency_ms, degraded }`, exit 1 ante flag desconocido, exit 2 cuando el adapter está degradado, exit 3 cuando `task-file` no existe. | M | P2-03 |
| P2-05 | Crear `verifyPhase2.ts` que ejecuta `vitest run` con `shell: true` (mismo patrón que `verifyPhase1.ts:102`, **sin** `cmd.exe /c`), valida presencia de los 6 artefactos Phase 2 en `ARTIFACTS`, mide `latency_ms_p95` desde los tests de `runPreflight`, y escribe `reports/phase2/verify-report.json` con el schema de design §8 más `metrics.latency_ms_p95` (≤ 2000) y `metrics.degraded_supported: true`. | `src/cli/verifyPhase2.ts`, `reports/phase2/.gitkeep`, `test/cli/verifyPhase2.test.ts` | `npm run verify:phase2` exit 0 local + reporte con `exit_code: 0`, `tests_passed > 0`, `tests_failed: 0`, `metrics.latency_ms_p95 ≤ 2000`, `metrics.degraded_supported: true`, `metrics.canonical_topic_key = "engram-rag/agent-rigor-protocol/v2"`. | M | P2-04 |
| P2-06 | Guardrail `noLiveMcpInTests.test.ts` que escanea `test/**/*.ts` y `src/**/*.ts` y falla si encuentra un import de `@modelcontextprotocol/*`, `engram-mcp`, o path absoluto al binario MCP — para que Phase 2 (y futuras) no introduzcan live MCP en CI. | `test/guardrails/noLiveMcpInTests.test.ts` | `npm test -- noLiveMcpInTests` falla si aparece un import prohibido. Patrón espejo de `test/guardrails/noLegacyTopicKeys.test.ts`. | S | P2-02 |
| P2-07 | Documentar `docs/phase2-acceptance.md` con los 3 criterios de cierre (test, verify, reporte); agregar step `npm run verify:phase2` a `.github/workflows/ci.yml` después del step de `verify:phase1`; agregar script `verify:phase2` a `package.json` (sin tocar `verify:phase1`); actualizar `test/ci/workflow.test.ts` para validar la nueva step; crear `test/docs/phase2-acceptance.test.ts`. | `docs/phase2-acceptance.md`, `.github/workflows/ci.yml`, `package.json`, `test/ci/workflow.test.ts`, `test/docs/phase2-acceptance.test.ts` | `npm test -- workflow` + `npm test -- phase2-acceptance` validan que el workflow ejecute `verify:phase2` y que la doc exija `npm test` + `npm run verify:phase2` + reporte JSON. `npm run verify:phase1` sigue funcionando intacto. | S | P2-05 |

## 4. Criterio de Phase 2 done

Phase 2 está terminada solo si estos comandos pasan localmente y en CI:

```bash
npm test
npm run verify:phase2
```

El output final debe incluir `reports/phase2/verify-report.json` con `exit_code: 0`, `metrics.latency_ms_p95 ≤ 2000` y `metrics.degraded_supported: true`. Si el reporte no existe, Phase 2 no está cerrada — misma regla que Phase 1 (design §8 + charter §10).

Adicionalmente, `npm run verify:phase1` debe seguir pasando intacto: Phase 2 no toca ningún artefacto de Phase 1.

## 5. Dependencias bloqueantes

| Bloqueo | Estado | Resolución |
|---------|--------|------------|
| Contratos de Phase 1 (`RetrievalRequest`, `RetrievalPlan`, `KnowledgeRecord`, `defaultForbiddenTopicAliases`) deben existir. | Resuelto en `main` desde Phase 1 (PR #1, merge commit `5eb08d3`). | P2-01 importa desde `src/contracts/*`; no redefine tipos. |
| `buildRetrievalPlan()` debe ser callable sin efectos. | Resuelto en `main` desde Phase 1 (PR #1). | P2-03 invoca `buildRetrievalPlan(request)` antes de tocar el adapter. |
| Las fixtures de Phase 1 deben estar presentes. | Resuelto: `fixtures/knowledge/powershell-and.json` y `sdd-spec-gherkin.json` commiteadas en PR #1. | P2-03 test AC3 lee `powershell-and.json`, parsea con `KnowledgeRecordSchema.parse`, y lo pasa al fake adapter. |
| `verify:phase1` no debe ser sobrescrito. | Bloqueante suave. | P2-07 agrega `verify:phase2` como script nuevo; no modifica `verify:phase1`. |
| `cmd.exe /c` no debe aparecer en código nuevo. | Bloqueante (lesson Phase 1, #736). | P2-05 usa `execFileSync("npx", [...args], { shell: true })` — mismo patrón que `verifyPhase1.ts:102`. |
| Live MCP no debe entrar a `test/` o `src/`. | Bloqueante (lesson Phase 1 §3). | P2-06 es un guardrail que falla el build si aparece un import prohibido. |

## 6. Lecciones de Phase 1 aplicadas

Cada lesson del prompt original está mapeada a la task que la enforce:

| # | Lección | Task que la enforce | Mecanismo concreto |
|---|---------|---------------------|---------------------|
| 1 | No usar `cmd.exe /c` en ningún spawn. | P2-05 | `verifyPhase2.ts` usa `execFileSync("npx", [...], { shell: true })`, idéntico a `verifyPhase1.ts:88-103`. P2-05 test corre en CI Linux. |
| 2 | No agregar dependencias nuevas sin justificación escrita. | P2-01, P2-02, P2-03, P2-04, P2-05 | Todas las tasks usan `node:fs`, `node:path`, `node:child_process`, `zod`, `vitest`, `tsx` (ya instalados en `package.json`). Cero deps nuevas. |
| 3 | Fake adapter determinístico es el target primario, no el live. | P2-02 + P2-06 | P2-02 implementa el fake como único adapter probado. P2-06 falla el build si alguien importa `@modelcontextprotocol/*` en `test/` o `src/`. |
| 4 | Orden `mem_context` → `mem_search` → `mem_get_observation` debe ser testeado con spy. | P2-03 | P2-03 primer `it` test inspecciona `fakeAdapter.callLog` y asserta el orden con `.toHaveBeenCalledBefore(spy2)` o comparación de índices. |
| 5 | Degraded path es first-class, no afterthought. | P2-03 | P2-03 incluye 2 tests de degradación: (a) `failureMode: 'throw'` solo en `mem_search` → `degraded: true` con `records: []`; (b) `failureMode: 'throw'` solo en `mem_get_observation` → `degraded: true` con `applied_rules` parcial. **Nunca** lanza. |
| 6 | Latency budget documentado (p95 < 2s) y testeado. | P2-03 + P2-05 | P2-03 test 4 asserta `latency_ms > 0`. P2-05 mide `latency_ms_p95` desde los tests de P2-03 y lo exige ≤ 2000 en el reporte (charter §5). Si excede, `npm run verify:phase2` exit ≠ 0 con mensaje claro. |
| 7 | No sobrescribir `verify:phase1`. Nuevo script es `verify:phase2`. | P2-07 | P2-07 patch en `package.json` agrega `"verify:phase2": "node --import tsx src/cli/verifyPhase2.ts"` sin tocar la línea de `verify:phase1`. `test/cli/verifyPhase2.test.ts` corre el script y verifica que `verify:phase1` sigue funcionando. |

**Adicional (no listada en el prompt, derivada de obs #735 y #736)**: el PR único de Phase 2 excede las 400 líneas. Esto NO contradice la lesson #7 — la lesson es sobre scripts de verificación, no sobre el PR global. El usuario pre-cached `single-pr` + `Chained PRs recommended: No`; el forecast honesto marca `400-line budget risk: High` y `Chain strategy: size-exception`, pero respeta la decisión preflight.
