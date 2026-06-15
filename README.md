# Proyecto_ErrorLog

> Base de datos de errores y soluciones para subagentes de IA.

ErrorLog es un sistema que permite a los subagentes de IA **almacenar errores que cometieron y consultar errores pasados antes de actuar**. La idea es simple: si un subagente ya se mandó una cagada antes, que tenga memoria de eso y no la repita.

Arrancó como un experimento de RAG (recuperación de documentos) pero evolucionó a algo más concreto: una base operacional de incidentes con capacidad de búsqueda, resolución tipada, y persistencia en Engram.

Se expone como servidor MCP con 7 herramientas.

---

## ¿Qué problema resuelve?

Los subagentes de IA (los que ejecutan fases como proposal, design, apply, verify) **no tienen memoria**. Cada vez que arrancan arrancan de cero. Si un subagente de `sdd-apply` ya cometió un error de frontmatter de skill, lo va a volver a cometer porque no tiene registro de que eso ya pasó.

ErrorLog resuelve eso:

1. **Antes de actuar**, el subagente consulta si ya hubo errores similares en el pasado
2. **Si encuentra un match**, recibe una corrección tipada (`allow` / `correct` / `blocked`)
3. **Si comete un error nuevo**, lo registra con su solución para el futuro
4. **Métricas operacionales** que prueban que el sistema está funcionando (o muestran cuando está degradado)

---

## ¿De dónde viene la idea?

El proyecto arrancó en 2024 como `engram-rag`, una exploración en español de RAG/KAG híbrido inspirado en GraphRAG de Microsoft. Esa versión (`rag-system/fase-2/`, `rag-system/fase-final/`) demostró que la idea era viable pero el código no era producible.

**v2 se reescribió de cero** con un enfoque contract-first:

- Todo arranca con **esquemas Zod** — no hay datos sin tipar circulando
- **Recuperación determinista** — `buildRetrievalPlan` es una función pura
- **Sin embeddings black-box** — el sistema de embedders usa un hashing determinista y auditable
- **Verificación por fases** — cada fase tiene un script `verify:phaseN` que prueba que funciona

La segunda evolución fue el **agent-error-learning-loop**, que transformó el RAG documental en un sistema de memoria operacional para subagentes. Ahí nació ErrorLog como concepto: ya no se trata de recuperar documentos, sino de **recordar errores**.

---

## Lo que hace

ErrorLog tiene dos caras que comparten el mismo servidor MCP:

| Sistema | Qué hace | Tools | Backend |
|---------|----------|-------|---------|
| **Error-learning loop** | Consulta y registra errores pasados en Engram | `error_preflight`, `error_learn`, `error_stats` | `src/engram/` — preflight, enforcement tipado, métricas |
| **Document RAG** | Recuperación desde un corpus de documentos (legacy) | `rag_query`, `rag_ingest`, `rag_eval`, `rag_stats` | `src/rag/` — recuperación híbrida/léxica/semántica/grafo |

**Regla dura:** las tools `error_*` solo llaman a Engram. Nunca llaman a la superficie `rag_*`. El script `mcp:smoke` lo enforcea con un scan estático.

---

## Honest assessment

### Lo que está sólido ✅

- **Arquitectura modular, tipada, testeable.** Separación clara entre contracts, retrieval, engram, MCP, CLI.
- **Cobertura de tests fuerte.** 65 tests para 50 módulos fuente (~130%). Graph index, embedders, pipeline de retrieval, enforcement, trace system, hybrid retriever — todo cubierto.
- **TypeScript compila limpio.** `npx tsc --noEmit` pasa con `strict: true`.
- **El MCP server funciona.** `npm run mcp:smoke` prueba que las 7 herramientas responden.
- **Multiplataforma.** El launcher evita `cmd /c`, `shell: true`, y `&&`. Funciona igual en Windows, macOS y Linux.
- **Decisiones documentadas.** `rag-system/v2/charter.md` + `design.md` explican el porqué de cada cosa.

### Lo que está flojo o incompleto ⚠️

| Issue | Impacto | Detalle |
|-------|---------|---------|
| **Integración live con Engram sin test en CI** | Medio | El adaptador live requiere `ENGRAM_BASE_URL` y `ENGRAM_PROJECT`. CI no los setea. Si Engram cambia su API, se rompe en silencio. |
| **`ragServer.ts` sin tests directos** | Bajo-Medio | El entry point del MCP server no tiene tests unitarios. Las tools se prueban individualmente y `mcpSmoke` hace un chequeo de superficie, pero si el wiring se rompe el suite no lo atrapa. |
| **`dashboardServer.ts` es dead code de v1** | Bajo | 236 líneas de un servidor HTTP para un dashboard HTML que nadie usa. Sin tests, sin callers en v2. |
| **`verifyAll` tiene un quirk en Windows** | Bajo | El chequeo `invokedDirectly` construye una URL `file://` manualmente que puede fallar en Windows. |
| **Sin benchmarks de rendimiento** | Bajo | No hay tests de performance (p50/p95). Existen scores de eval pero no regresiones de latencia. |
| **Estado del CI desconocido** | Bajo | El workflow existe pero no hay badge ni evidencia de que pase en GitHub Actions. |

### Resumen

El código es **funcional y está bien diseñado** pero tiene **dos riesgos reales**:

1. **La integración live con Engram no se testea en CI.** Si Engram cambia su API, el adaptador live se rompe silenciosamente.
2. **Nadie lo llevó a producción.** El MCP server funciona, pero no hay evidencia de que se haya conectado a un flujo de agente real.

---

## Cómo arrancar

```bash
npm install
npm test
npm run verify:all
```

| Comando | Qué hace |
|---------|----------|
| `npm install` | Instala TypeScript, Vitest, Zod, y tsx |
| `npm test` | Corre los 65 tests de Vitest |
| `npm run verify:all` | **Fuente de verdad única.** Corre tests, guardrails, `tsc --noEmit`, y `mcp:smoke`. Sale non-zero si algo falla. |
| `npm run mcp:smoke` | Smoke test del MCP server (lista de tools, guardas, launcher) |

---

## Arquitectura

```
                          ┌──────────────────────┐
                          │     MCP Client        │
                          │  (opencode / agente)  │
                          └──────────┬───────────┘
                                     │ stdio
                          ┌──────────▼───────────┐
                          │   mcp/ragServer.ts   │
                          │    (7 herramientas)  │
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
              │  (live HTTP o   │
              │   fake adapter) │
              └─────────────────┘
```

---

## Layout del proyecto

```
.
├── src/
│   ├── contracts/         # Esquemas Zod y política de topic keys
│   ├── retrieval/         # buildRetrievalPlan() — pura, determinista
│   ├── rag/               # RAG documental: recuperación híbrida/semántica/grafo, embedder, eval
│   ├── engram/            # Loop operacional: preflight, enforcement, trace, adaptadores
│   ├── mcp/               # Servidor MCP + herramientas operacionales + métricas
│   ├── cli/               # preflight, mcpSmoke, verifyAll, scripts de verificación por fase
│   └── skills/            # installSkills, patchLiveSkills, renderRagBlock
├── test/                  # Tests Vitest (65 archivos), espeja src/
├── fixtures/              # Registros de conocimiento validados y corpus
├── eval/                  # Escenarios de eval RAG (JSON)
├── scripts/               # eval-fake-vs-live.ts — paridad operacional
├── bin/
│   └── engram-rag-stdio.mjs  # Launcher stdio multiplataforma
├── openspec/              # Artefactos SDD (propuesta, diseño, tareas, specs)
├── docs/                  # Docs de aceptación por fase
├── reports/               # Reportes de verificación generados (artefactos runtime)
├── rag-system/            # Documentos históricos v1 y v2
│   ├── v2/                # Charter v2, diseño, tareas por fase
│   ├── fase-2/            # v1 — solo lectura
│   ├── fase-final/        # v1 — solo lectura
│   └── dashboard/         # v1 — solo lectura, probablemente roto
└── .github/workflows/     # CI
```

---

## Superficie MCP

| Tool | Sistema | Opera sobre | Respaldado por |
|------|---------|-------------|----------------|
| `error_preflight` | Error-learning loop | Memorias Engram (live HTTP o fake) | `src/engram/runPreflight.ts`, `src/engram/enforcement.ts` |
| `error_learn` | Error-learning loop | Memorias Engram | `src/engram/fakeEngramAdapter.ts` o `liveEngramAdapter.ts` |
| `error_stats` | Error-learning loop | `OperationalMetricsState` en proceso | `src/mcp/operationalMetrics.ts` |
| `rag_query` | Document RAG (legacy) | Corpus (`fixtures/corpus`) | `src/rag/retriever.ts`, `src/rag/hybridRetriever.ts` |
| `rag_ingest` | Document RAG (legacy) | Corpus | `src/rag/semanticRetriever.ts`, `src/rag/graphIndex/store.ts` |
| `rag_eval` | Document RAG (legacy) | Escenarios de eval contra corpus | `src/rag/ragEval.ts` |
| `rag_stats` | Document RAG (legacy) | Corpus cargado | `src/rag/corpusLoader.ts`, `src/rag/chunker.ts` |

### Config para opencode

```jsonc
{
  "mcp": {
    "Proyecto_ErrorLog": {
      "type": "stdio",
      "command": "node",
      "args": ["<ruta-absoluta>/engram-rag/bin/engram-rag-stdio.mjs"],
      "env": {
        "ENGRAM_BASE_URL": "http://127.0.0.1:7437",
        "ENGRAM_PROJECT": "Proyecto_ErrorLog"
      }
    }
  }
}
```

No uses `cmd /c "cd <repo> && ..."` en la config MCP. El launcher usa `child_process.spawn` con `shell: false`; funciona igual en todas las plataformas.

---

## Cobertura de tests

65 archivos de test para 50 módulos fuente. Cobertura por área:

| Área | Source files | Test files | Estado |
|------|-------------|------------|--------|
| Contracts | 5 | 5 | Completo |
| Retrieval planner | 1 | 2 | Completo |
| RAG engine (chunker, retriever, hybrid, semantic, corpus, eval) | 10 | 11 | Completo |
| Embedder system (registry, embedder, hashing) | 5 | 4 | Completo |
| Graph index (extract, store, traverse) | 3 | 4 | Completo |
| Vector index (cosine, store) | 2 | 2 | Completo |
| Engram loop (preflight, enforcement, trace, adapters) | 7 | 15 | Completo |
| MCP tools (operational tools, metrics) | 2 | 3 | Parcial (tools probadas individualmente; `ragServer.ts` sin test) |
| CLI (verifyAll, mcpSmoke, preflight) | 4 | 5 | Completo |
| Guardrails | — | 6 | Completo |
| CI | — | 1 | Completo |
| v1 (dashboardServer) | 1 | 0 | Sin tests — dead code |
| RRF | 1 | 1 (via hybridRetriever) | Probado indirectamente |

---

## Estado por fase

| Fase | Qué | Estado | Notas |
|------|-----|--------|-------|
| **1** | Knowledge contract + retrieval planner | ✅ Implementado | `npm run verify:phase1` verde. `buildRetrievalPlan` es función pura. |
| **2** | Engram preflight adapter + enforcement | ✅ Implementado | Adaptador fake + live, `runPreflight`, `PreflightEnforcement` tipado. |
| **3** | Skill integration | ✅ Implementado | `installSkills`, `patchLiveSkills` — ambos verdes. |
| **4** | Eval harness + métricas operacionales | ✅ Implementado | `eval-fake-vs-live.ts`, `OperationalMetricsState` persistente, trace IDs estables. |
| **5** | Verification gates, MCP smoke, launcher | ✅ Implementado | `verify:all`, `mcp:smoke`, launcher stdio, matriz de exit codes. |
| **6** | Document-RAG correctness cleanup | ✅ Implementado (PR6/#32) | Mergeado a main. |

---

## CI

`.github/workflows/ci.yml` corre en push a `main` y en pull requests:

- `npm ci`
- `npm test`  
- `npm run verify:all -- --skip-live`
- `npm run mcp:smoke`
- Scripts de verificación fase 1–4

**Nota:** el path live de Engram está excluido en CI (`--skip-live`). CI ejercita solo el adaptador fake.

---

## Fuentes de verdad

| Documento | Qué cubre |
|-----------|-----------|
| `openspec/config.yaml` | Configuración del proyecto SDD |
| `openspec/changes/agent-error-learning-loop/proposal.md` | Por qué existe el loop, alcance, criterios de éxito |
| `openspec/changes/agent-error-learning-loop/design.md` | Arquitectura, contratos, flujo de datos, límites de PRs |
| `openspec/changes/agent-error-learning-loop/tasks.md` | Tareas atómicas con forecast de carga de revisión |
| `rag-system/v2/charter.md` | Por qué existe v2, métricas de éxito, alcance |
| `rag-system/v2/design.md` | Arquitectura fases 1–4, contratos |
| `reports/verify-all/verify-report.json` | **Generado** — prueba machine-readable de que `verify:all` está verde (correr `npm run verify:all` para producirlo) |
