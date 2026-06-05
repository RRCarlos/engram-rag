---
title: "Engram RAG for Agent Improvement v2 - Project Charter"
version: "2.0"
status: "design-only"
date: "2026-06-05"
project: "engram-rag"
artifact: "charter"
language: "es-AR"
canonical_topic_key: "engram-rag/agent-rigor-protocol/v2"
---

# Project Charter: Engram RAG for Agent Improvement v2

## 1. Decisión

Engram RAG v2 será un sistema verificable de recuperación de conocimiento para agentes, no una colección de documentos declarativos. Cada fase deberá entregar artefactos ejecutables, tests y evidencia de corrida antes de considerarse cerrada.

El `topic_key` canónico del protocolo será `engram-rag/agent-rigor-protocol/v2`.

Justificación:

| Criterio | Decisión |
|----------|----------|
| Evitar colisiones | El prefijo `engram-rag/` separa este protocolo de patrones genéricos como `pattern/*`. |
| Evitar acoplamiento a fases | No usa `fase-2`, porque el protocolo vive más que una fase de implementación. |
| Permitir evolución controlada | El sufijo `/v2` permite introducir cambios incompatibles sin reescribir evidencia histórica. |
| Converger v1 | Reemplaza las variantes `protocol/rigor`, `pattern/agent-rigor-protocol` y `sdd/engram-rag-fase-2/*` como key de protocolo. |

Los registros individuales de fallos podrán usar keys derivadas, por ejemplo `engram-rag/failures/sdd-apply/powershell-and`, pero deberán referenciar el protocolo canónico anterior.

## 2. Problema concreto y evidencia

Los sub-agentes repiten errores conocidos porque no recuperan conocimiento validado antes de actuar. v1 intentó resolver esto, pero falló por declarar avances sin evidencia ejecutable.

Evidencia local y persistente:

| Evidencia | Fuente | Impacto |
|-----------|--------|---------|
| El cierre declara 8 fases completas y sistema operativo. | `rag-system/fase-final/CIERRE-FASES.md:3-7`, `:69-87` | Cierre autoatribuido sin verify report ni tests. |
| La Fase 5 promete `api/server.js` y dashboard con `fetch()`. | `rag-system/fase-final/CIERRE-FASES.md:45-52` | El artefacto prometido no existe. |
| No existe `api/server.js`. | Búsqueda local `**/api/server.js`: sin resultados. | La API real nunca fue entregada. |
| El dashboard usa datos hardcodeados. | `rag-system/dashboard/app.js:4-30` | La UI dice representar Engram, pero lee un literal JS. |
| El refresh simula latencia con `setTimeout`. | `rag-system/dashboard/app.js:79-90` | No hay llamada real a backend ni a Engram. |
| El README admite datos hardcodeados y simulados. | `rag-system/dashboard/README.md:21-25`, `:40-55` | Contradice el cierre que afirma “API Real”. |
| No hay `package.json`, tests ni workflows. | Búsquedas locales `**/package.json` y `**/.github/workflows/*`: sin resultados. | No hay CI/local test runner para validar fases. |
| Hay tres familias de topic keys incompatibles. | `charter.md:14`, `charter.md:22`, `fase-2-proposal.md:16-21`, `dashboard/app.js:14-19` | El retrieval no tiene contrato estable. |
| Memoria persistente confirma el estado real. | Engram observation `#728`, topic `engram-rag/repo-state-2026-06-05` | Repo documentation-only, dashboard hardcodeado, sin API, sin tests. |
| Git muestra 8 commits el mismo día. | `git log --oneline --date=short` | Patrón de cierre acelerado sin evidencia incremental. |

## 3. Usuarios objetivo

| Usuario | Necesidad |
|---------|-----------|
| Orquestador OpenCode | Antes de delegar trabajo, quiere que el agente reciba fallos conocidos relevantes. |
| Sub-agentes SDD | Necesitan contexto accionable sobre errores previos del mismo tipo de tarea. |
| Revisor humano | Necesita evidencia objetiva de que cada fase funciona antes de aprobarla. |
| Mantenedor de skills | Necesita instalar, verificar y revertir cambios en `SKILL.md` sin romper agentes. |
| Operador del dashboard | Necesita observar datos reales, nunca simulados como si fueran producción. |

## 4. Casos de uso

1. Guardar un fallo real con solución validada como `KnowledgeRecord` en Engram.
2. Construir un plan de retrieval contextual antes de una acción de agente.
3. Ejecutar preflight retrieval y obtener observaciones completas con `mem_get_observation`.
4. Inyectar o verificar el protocolo en skills sin duplicar bloques ni romper frontmatter.
5. Reproducir escenarios conocidos, como PowerShell `&&` o specs sin Gherkin, y comprobar que el contexto correcto se recupera.
6. Mostrar métricas en dashboard solo desde una llamada HTTP real.

## 5. Métricas de éxito

| Métrica | Meta inicial | Cómo se mide |
|---------|--------------|--------------|
| Cobertura de preflight | 100% de agentes target ejecutan retrieval antes de acción en harness. | Test de skill/harness que registra llamadas `mem_context`, `mem_search`, `mem_get_observation`. |
| Relevancia top-k | El fallo correcto aparece en top 3 para 5 fixtures críticos. | Test de retrieval con adapter fake y fixtures versionados. |
| Reducción de fallos recurrentes | 50% menos errores repetidos en suite de evaluación controlada. | Comparación baseline vs RAG en Phase 4. |
| Latencia local | p95 < 2 s para `mem_search` + `mem_get_observation`. | Test local con medición y reporte JSON. |
| Convergencia de topic key | 0 usos activos de aliases v1 en código, fixtures operativos o bloques de skill. | Test que falla ante aliases fuera de secciones forenses marcadas como evidencia histórica. |
| No hardcoded dashboard data | 100% de datos visibles vienen de `/api/*`. | Test de UI que intercepta `fetch()` y falla si se renderiza fixture global. |
| Cierre con evidencia | Cada fase tiene `verify-report.json` generado por comando. | CI/local debe adjuntar comando, status y output resumido. |

## 6. Alcance

### Incluye

| Incluye | Razón |
|---------|-------|
| Schema versionado de conocimiento. | Evita guardar “lecciones” ambiguas que no se puedan recuperar ni validar. |
| Retrieval planner determinístico. | Permite testear qué se buscará antes de depender del agente. |
| Adapter a Engram MCP con fake adapter para tests. | Usa backend disponible sin acoplar tests a una sesión MCP real. |
| Skill integration verificable. | El sistema no depende solo de buenas intenciones en Markdown. |
| Evaluation harness para fallos conocidos. | Mide si el sistema recupera conocimiento que previene errores. |
| API/dashboard reales solo al final. | Evita repetir el dashboard simulado de v1. |

### Excluye

| Excluye | Motivo |
|---------|--------|
| Reemplazar SQLite/FTS5 de Engram. | El backend ya existe y es suficiente para v2. |
| Embeddings o vector DB en Fase 1. | Agrega complejidad antes de probar el contrato básico. |
| Modificar el runner interno de OpenCode. | No es necesario para validar el primer slice. |
| Dashboard antes de API real. | Fue una causa directa de falsa completitud en v1. |
| Declarar reducción de errores sin suite de evaluación. | La métrica debe salir de corridas repetibles. |

## 7. Stack técnico propuesto

| Componente | Stack | Justificación |
|------------|-------|---------------|
| Runtime y CLI | Node.js 20 + TypeScript | Encaja con el dashboard JS existente y facilita contratos tipados. |
| Tests | Vitest | Rápido para unit/integration tests con adapters fake. |
| Validación de schemas | Zod + JSON Schema export | El mismo contrato valida fixtures, API y payloads de Engram. |
| HTTP API futura | Fastify | Schemas por endpoint, buena performance local, bajo boilerplate. |
| UI futura | HTML/TypeScript mínimo | No introducir framework hasta necesitarlo. |
| CI | GitHub Actions con `npm ci` y `npm test` | Verificación estándar, reproducible localmente. |
| Engram backend | MCP tools existentes | Mantiene SQLite/FTS5 y scopes `project`/`personal` ya disponibles. |

## 8. Fases de entrega de alto nivel

| Fase | Entrega | Cierre permitido solo si |
|------|---------|--------------------------|
| 1. Knowledge contract + retrieval planner | Schema, topic policy, fixtures y planner determinístico. | `npm test` prueba schema, aliases prohibidos y plan de búsqueda. |
| 2. Engram preflight adapter | `runPreflight()` y CLI con adapter fake/live. | Tests prueban llamadas completas y reporte de latencia. |
| 3. Skill integration | Instalador/verificador idempotente para `SKILL.md`. | Tests con fixtures demuestran inserción, no duplicación y rollback. |
| 4. Evaluation harness | Suite de fallos recurrentes con baseline vs RAG. | Reporte JSON muestra recuperación top-k y métricas. |
| 5. Real API + dashboard | API HTTP y UI que consume datos reales. | Tests HTTP/UI prueban `fetch()` real y prohíben hardcoded data. |

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación concreta |
|--------|---------------------|
| Repetir cierre autoatribuido. | Ninguna fase se cierra sin comando, test y `verify-report.json`. |
| FTS5 recupera resultados irrelevantes. | Query planner combina canonical key, agent id, failure kind y task context; top-k se mide con fixtures. |
| Los agentes ignoran instrucciones. | Skill integration incluye harness que registra tool calls esperadas antes de acción. |
| Cambios en skills rompen OpenCode. | Instalador idempotente, dry-run obligatorio, backup y rollback testado en temp dir. |
| Engram MCP no disponible en CI. | Tests críticos usan fake adapter; live smoke es local y marcado explícitamente. |
| Dashboard vuelve a simular datos. | La Phase 5 falla si no hay endpoint real y `fetch()` observable. |
| Topic key drift. | Test de aliases prohibidos en código/protocolos activos y constante única `CANONICAL_PROTOCOL_TOPIC_KEY`; las menciones forenses deben quedar marcadas como evidencia histórica. |
| Sobrecarga de latencia por retrieval. | Medición p95 y límite de top-k; fallback documentado cuando Engram no responde. |

## 10. Definición de listo

“Listo” significa que existe evidencia ejecutable. Para cada fase se requiere:

| Requisito | Evidencia mínima |
|-----------|------------------|
| Artefactos prometidos | Archivos presentes en el repo. |
| Tests | Comando local y CI con salida exitosa. |
| Reporte | `verify-report.json` generado por el comando de fase. |
| Rollback | Procedimiento probado cuando la fase modifica estado externo. |
| Métrica | Resultado medible, no declaración narrativa. |
