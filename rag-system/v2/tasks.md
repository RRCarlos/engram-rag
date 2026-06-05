---
title: "Engram RAG for Agent Improvement v2 - Plan ejecutable Phase 1"
version: "2.1"
status: "design-only"
date: "2026-06-05"
project: "engram-rag"
artifact: "tasks"
language: "es-AR"
phase: 1
phase1_status: "archived"
phase1_pr: "https://github.com/RRCarlos/engram-rag/pull/1"
phase1_merge_commit: "5eb08d3"
phase1_final_sha: "480093b"
phase1_verdict: "PASS WITH WARNINGS (0 critical, 1 warning: diff-budget overrun 4.4x)"
canonical_topic_key: "engram-rag/agent-rigor-protocol/v2"
---

# Tasks ejecutables: Phase 1

## 1. Alcance de Phase 1

Phase 1 entrega el contrato mínimo verificable: test runner, policy de topic keys, schema de conocimiento, fixtures de fallos reales y retrieval planner determinístico. No modifica skills reales, no llama Engram live y no crea dashboard.

## 2. Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 250-380 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR for Phase 1 contract and tests |
| Delivery strategy | single-pr |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

## 3. Orden de ejecución

| ID | Descripción | Archivos | Done verificable | Tamaño | Depende de |
|----|-------------|----------|------------------|--------|------------|
| P1-01 | Inicializar el proyecto TypeScript testeable con Vitest. | `package.json`, `tsconfig.json`, `vitest.config.ts`, `test/smoke.test.ts` | `npm install` y `npm test` ejecutan un smoke test exitoso. | S | Ninguna |
| P1-02 | Crear evidencia forense versionada de v1 usada por el diseño. | `docs/evidence/v1-forensics.md`, `test/evidence/v1-forensics.test.ts` | `npm test -- v1-forensics` valida que el documento cite Engram `#728` y paths v1 críticos. | S | P1-01 |
| P1-03 | Definir la policy única de topic keys y aliases prohibidos. | `src/contracts/topicKeys.ts`, `test/contracts/topicKeys.test.ts` | `npm test -- topicKeys` confirma `engram-rag/agent-rigor-protocol/v2` y rechaza aliases v1. | S | P1-01 |
| P1-04 | Definir el schema `KnowledgeRecord` para fallos y soluciones validadas. | `src/contracts/knowledgeRecord.ts`, `test/contracts/knowledgeRecord.test.ts` | `npm test -- knowledgeRecord` acepta un registro válido y rechaza registros sin evidencia o solución. | M | P1-03 |
| P1-05 | Agregar fixture validado para el fallo PowerShell `&&`. | `fixtures/knowledge/powershell-and.json`, `test/fixtures/powershell-and.test.ts` | `npm test -- powershell-and` valida schema, canonical topic key y solución `; if ($?) { ... }`. | S | P1-04 |
| P1-06 | Agregar fixture validado para specs sin escenarios Gherkin. | `fixtures/knowledge/sdd-spec-gherkin.json`, `test/fixtures/sdd-spec-gherkin.test.ts` | `npm test -- sdd-spec-gherkin` valida schema y regla `Given/When/Then`. | S | P1-04 |
| P1-07 | Implementar el contrato `RetrievalRequest` y `RetrievalPlan`. | `src/contracts/retrieval.ts`, `test/contracts/retrieval.test.ts` | `npm test -- retrieval` valida acciones `shell`, `spec`, `design`, `verify` y agentes SDD permitidos. | M | P1-03 |
| P1-08 | Implementar `buildRetrievalPlan()` sin llamadas a Engram live. | `src/retrieval/retrievalPlan.ts`, `test/retrieval/retrievalPlan.test.ts` | `npm test -- retrievalPlan` prueba que `sdd-apply` + PowerShell busca protocolo canónico, agente y trigger `powershell`. | M | P1-05, P1-07 |
| P1-09 | Agregar guardrail estático contra topic keys v1 en código y protocolos activos. | `test/guardrails/noLegacyTopicKeys.test.ts` | `npm test -- noLegacyTopicKeys` falla si un alias v1 aparece fuera de secciones marcadas como evidencia histórica. | S | P1-03 |
| P1-10 | Agregar CI mínimo que ejecuta la suite local. | `.github/workflows/ci.yml`, `test/ci/workflow.test.ts` | `npm test -- workflow` valida que el workflow incluya `npm ci` y `npm test`. | S | P1-01 |
| P1-11 | Crear script de verificación de Phase 1 que emite reporte JSON. | `src/cli/verifyPhase1.ts`, `reports/phase1/.gitkeep`, `test/cli/verifyPhase1.test.ts` | `npm run verify:phase1` genera `reports/phase1/verify-report.json` con exit code y conteo de tests. | M | P1-08, P1-09, P1-10 |
| P1-12 | Documentar cómo cerrar Phase 1 sin autoatribución. | `docs/phase1-acceptance.md`, `test/docs/phase1-acceptance.test.ts` | `npm test -- phase1-acceptance` valida que el documento exija `npm test`, `npm run verify:phase1` y reporte JSON. | S | P1-11 |

## 4. Criterio de Phase 1 done

Phase 1 está terminada solo si estos comandos pasan localmente y en CI:

```bash
npm test
npm run verify:phase1
```

El output final debe incluir `reports/phase1/verify-report.json`. Si el reporte no existe, Phase 1 no está cerrada.

## 5. Dependencias bloqueantes

| Bloqueo | Resolución |
|---------|------------|
| No existe `package.json` en v1. | P1-01 crea el runner antes de cualquier contrato. |
| Topic key drift de v1. | P1-03 y P1-09 bloquean aliases desde el primer slice. |
| Falsos cierres sin evidencia. | P1-11 y P1-12 convierten el cierre en comando verificable. |
