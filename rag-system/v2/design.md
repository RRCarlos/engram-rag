---
title: "Engram RAG for Agent Improvement v2 - Diseño técnico por fases"
version: "2.0"
status: "design-only"
date: "2026-06-05"
project: "engram-rag"
artifact: "design"
language: "es-AR"
canonical_topic_key: "engram-rag/agent-rigor-protocol/v2"
---

# Diseño técnico por fases

## 1. Arquitectura objetivo

El sistema separa contrato, retrieval, integración con agentes, evaluación y observabilidad. La UI no existe hasta que exista una API real.

```text
Agent task context
       |
       v
Retrieval Planner -----> Topic Key Policy
       |
       v
Preflight Runner -----> Engram Adapter -----> Engram MCP/SQLite FTS5
       |                       |
       v                       v
Preflight Result        Knowledge Records
       |
       v
Agent Skill Protocol -----> Agent Action
       |
       v
Evaluation + Verify Reports
       |
       v
Real API -----> Dashboard
```

## 2. Contratos globales

### 2.1 Topic key

| Campo | Valor |
|-------|-------|
| Protocolo canónico | `engram-rag/agent-rigor-protocol/v2` |
| Alias prohibidos | `protocol/rigor`, `protocol/rigor/v1`, `pattern/agent-rigor-protocol`, `pattern/agent-rigor-protocol-v1-master`, `sdd/engram-rag-fase-2/*` |
| Failure keys derivadas | `engram-rag/failures/{agent_id}/{failure_slug}` |

### 2.2 Schemas

```ts
type AgentId = "sdd-apply" | "sdd-spec" | "sdd-design" | "sdd-verify" | "sdd-explore" | "sdd-tasks" | "sdd-propose" | "sdd-archive" | "sdd-init" | "sdd-onboard";

interface KnowledgeRecord {
  schema_version: "2.0";
  topic_key: string;
  canonical_protocol_topic_key: "engram-rag/agent-rigor-protocol/v2";
  agent_id: AgentId | "cross-agent";
  failure_kind: "shell" | "spec" | "design" | "verification" | "convention" | "dashboard" | "workflow";
  failure_signature: string;
  trigger_terms: string[];
  validated_solution: string;
  evidence_refs: string[];
  validation_status: "validated" | "superseded" | "draft";
  last_validated_at: string;
}

interface RetrievalRequest {
  project: string;
  agent_id: AgentId;
  task_text: string;
  action_kind: "read" | "write" | "shell" | "spec" | "design" | "verify" | "review";
  cwd?: string;
  files?: string[];
  shell?: "powershell" | "bash" | "unknown";
}

interface RetrievalPlan {
  context_query: { project: string; scope: "project" };
  searches: Array<{ query: string; project: string; scope: "project"; limit: number }>;
  require_full_observation: boolean;
  forbidden_topic_aliases: string[];
}

interface PreflightResult {
  request: RetrievalRequest;
  records: KnowledgeRecord[];
  applied_rules: string[];
  missing_expected_records: string[];
  latency_ms: number;
  degraded: boolean;
}
```

## 3. Fase 1: Knowledge contract + retrieval planner

### Objetivo

Entregar el primer slice pequeño y útil: un contrato versionado y testeado que impide repetir el drift de topic keys de v1 y define qué buscaría un agente antes de actuar.

### Componentes a construir

| Path | Tipo | Responsabilidad |
|------|------|-----------------|
| `package.json` | Create | Scripts `test`, `test:watch`, `verify:phase1`. |
| `tsconfig.json` | Create | Config TypeScript estricta. |
| `vitest.config.ts` | Create | Configuración de tests. |
| `src/contracts/topicKeys.ts` | Create | Constante canónica y aliases prohibidos. |
| `src/contracts/knowledgeRecord.ts` | Create | Schema `KnowledgeRecord`. |
| `src/retrieval/retrievalPlan.ts` | Create | `buildRetrievalPlan(request)`. |
| `fixtures/knowledge/*.json` | Create | Fallos reales v1/v2 serializados. |
| `test/**/*.test.ts` | Create | Tests de schema, topic policy y planner. |
| `.github/workflows/ci.yml` | Create | Ejecuta `npm ci` y `npm test`. |

### APIs/contratos

| Contrato | Firma |
|----------|-------|
| Topic policy | `getCanonicalProtocolTopicKey(): string` |
| Alias guard | `assertNoForbiddenTopicAliases(input: string): void` |
| Schema validation | `parseKnowledgeRecord(input: unknown): KnowledgeRecord` |
| Retrieval planner | `buildRetrievalPlan(request: RetrievalRequest): RetrievalPlan` |

### Criterios de aceptación verificables

| Criterio | Evidencia |
|----------|-----------|
| El topic key canónico existe en una sola constante. | `npm test -- topicKeys` pasa. |
| Los aliases v1 fallan. | Test parametrizado con aliases prohibidos. |
| Los fixtures de fallos validan contra schema. | `npm test -- knowledgeRecord` pasa. |
| `sdd-apply` + PowerShell genera búsqueda relevante. | Test de planner contiene `engram-rag/agent-rigor-protocol/v2`, `sdd-apply`, `powershell`. |
| CI ejecuta la suite. | Workflow testeado por archivo y validado en GitHub Actions al abrir PR. |

### Dependencias

No depende de fases posteriores. Es requisito estricto para Fases 2 a 5.

### Riesgos técnicos y rollback

| Riesgo | Rollback |
|--------|----------|
| Sobrediseñar el schema. | Mantener solo campos necesarios para retrieval y evidencia; revertir fixtures sin tocar Engram. |
| Tests demasiado acoplados a texto. | Testear contratos y aliases, no prosa completa. |

## 4. Fase 2: Engram preflight adapter

### Objetivo

Ejecutar el plan de retrieval contra herramientas Engram y devolver contexto completo para el agente antes de su primera acción.

### Componentes a construir

| Path | Tipo | Responsabilidad |
|------|------|-----------------|
| `src/engram/EngramTools.ts` | Create | Interface de tools `mem_context`, `mem_search`, `mem_get_observation`, `mem_save`. |
| `src/engram/runPreflight.ts` | Create | Ejecuta plan, obtiene observaciones completas y mide latencia. |
| `src/engram/fakeEngramAdapter.ts` | Create | Adapter determinístico para CI. |
| `src/cli/preflight.ts` | Create | CLI `engram-rag preflight --agent ... --task-file ... --json`. |
| `test/engram/*.test.ts` | Create | Tests unitarios e integración con fake adapter. |
| `reports/phase2/verify-report.json` | Generate | Evidencia de corrida. |

### APIs/contratos

| Contrato | Firma |
|----------|-------|
| Tool adapter | `interface EngramTools { mem_context(input): Promise<Context>; mem_search(input): Promise<SearchResult[]>; mem_get_observation(input): Promise<Observation>; mem_save(input): Promise<SaveResult>; }` |
| Preflight | `runPreflight(request: RetrievalRequest, tools: EngramTools): Promise<PreflightResult>` |
| CLI | `engram-rag preflight --project engram-rag --agent sdd-apply --task-file task.txt --json` |

### Criterios de aceptación verificables

| Criterio | Evidencia |
|----------|-----------|
| Preflight llama `mem_context` antes de `mem_search`. | Test con spy fake adapter. |
| Todo resultado de search usado se lee con `mem_get_observation`. | Test verifica IDs consultados. |
| Caso PowerShell recupera solución validada. | Fixture retorna regla “no usar `&&`; usar `; if ($?) { ... }`”. |
| Latencia se reporta. | `verify-report.json` incluye `latency_ms` y `degraded`. |
| Engram caído no bloquea al agente. | Test simula timeout y devuelve `degraded: true`. |

### Dependencias

Depende de Phase 1. No requiere modificar skills todavía.

### Riesgos técnicos y rollback

| Riesgo | Rollback |
|--------|----------|
| Adapter real no puede ejecutarse en CI. | Mantener fake adapter como contrato obligatorio; live smoke queda local y explícito. |
| Preflight agrega latencia excesiva. | Limitar `limit`, cortar por timeout y marcar `degraded`. |

## 5. Fase 3: Skill integration verificable

### Objetivo

Hacer que los agentes target ejecuten preflight antes de actuar, con instalación idempotente y rollback probado.

### Componentes a construir

| Path | Tipo | Responsabilidad |
|------|------|-----------------|
| `src/skills/renderRagBlock.ts` | Create | Genera bloque de protocolo desde contratos. |
| `src/skills/patchSkill.ts` | Create | Inserta/actualiza bloque después de frontmatter. |
| `src/skills/verifySkill.ts` | Create | Verifica estructura, topic key y no duplicación. |
| `src/cli/installSkills.ts` | Create | `--dry-run`, `--skills-dir`, `--backup-dir`, `--json`. |
| `test/fixtures/skills/*.md` | Create | Skills sintéticos con frontmatter realista. |
| `test/skills/*.test.ts` | Create | Inserción, update, idempotencia y rollback. |

### APIs/contratos

| Contrato | Firma |
|----------|-------|
| Render | `renderRagBlock(agent_id: AgentId): string` |
| Patch | `patchSkill(content: string, agent_id: AgentId): PatchResult` |
| Verify | `verifySkill(content: string, agent_id: AgentId): SkillVerification` |
| CLI | `engram-rag install-skills --skills-dir <path> --dry-run --json` |

### Criterios de aceptación verificables

| Criterio | Evidencia |
|----------|-----------|
| Inserta bloque después del frontmatter. | Test con fixture `sdd-apply.md`. |
| Segunda corrida no duplica. | Test idempotente. |
| Usa solo topic key canónico. | Test prohíbe aliases v1. |
| Dry-run no escribe archivos. | Test compara checksums antes/después. |
| Rollback restaura contenido. | Test en temp dir con backup. |

### Dependencias

Depende de Phase 1 y Phase 2. Puede avanzar en paralelo con Phase 4 después de tener fake adapter estable.

### Riesgos técnicos y rollback

| Riesgo | Rollback |
|--------|----------|
| Cambios externos en `C:\Users\PC\.config\opencode\skills`. | Dry-run obligatorio y backup timestamped antes de escribir. |
| Markdown con frontmatter no estándar. | Verificador falla con mensaje accionable; no parchea si no encuentra límites seguros. |

## 6. Fase 4: Evaluation harness y CI gates

### Objetivo

Medir si el sistema recupera conocimiento útil para fallos recurrentes antes de declarar mejora.

### Componentes a construir

| Path | Tipo | Responsabilidad |
|------|------|-----------------|
| `eval/scenarios/*.json` | Create | Casos PowerShell, Gherkin, conventions, dashboard hardcodeado. |
| `src/eval/runScenario.ts` | Create | Ejecuta retrieval contra fake/live adapter. |
| `src/eval/score.ts` | Create | Calcula top-k hit, missing rules y latencia. |
| `src/cli/eval.ts` | Create | `engram-rag eval --suite known-failures --json`. |
| `test/eval/*.test.ts` | Create | Scoring y escenarios mínimos. |
| `reports/phase4/eval-report.json` | Generate | Baseline vs RAG. |

### APIs/contratos

| Contrato | Firma |
|----------|-------|
| Scenario runner | `runScenario(scenario: EvalScenario, tools: EngramTools): Promise<EvalResult>` |
| Scoring | `scoreRetrieval(result: PreflightResult, expected: ExpectedRule[]): Score` |
| CLI | `engram-rag eval --suite known-failures --adapter fake --json` |

### Criterios de aceptación verificables

| Criterio | Evidencia |
|----------|-----------|
| 5 escenarios críticos versionados. | Test cuenta scenarios y valida schema. |
| Top-3 hit rate reportado. | `eval-report.json` incluye `top3_hit_rate`. |
| PowerShell y Gherkin recuperan reglas correctas. | Tests de scenario específicos. |
| CI bloquea aliases v1 activos y cierre sin reporte. | Tests de guardrail permiten citas forenses, pero fallan si un alias aparece en código, fixtures operativos o bloques de skill. |

### Dependencias

Depende de Phase 1 y Phase 2. Puede correr antes de modificar skills reales.

### Riesgos técnicos y rollback

| Riesgo | Rollback |
|--------|----------|
| Métricas confunden retrieval con comportamiento LLM. | Separar métricas de retrieval determinístico y métricas manuales de agente real. |
| Fixtures se vuelven obsoletos. | Versionar `last_validated_at` y marcar `superseded`. |

## 7. Fase 5: Real API + dashboard

### Objetivo

Mostrar estado del sistema con datos reales de API, no con literales hardcodeados.

### Componentes a construir

| Path | Tipo | Responsabilidad |
|------|------|-----------------|
| `src/api/server.ts` | Create | Fastify server con endpoints de knowledge. |
| `src/api/routes/knowledge.ts` | Create | Summary, records y detail. |
| `src/dashboard/app.ts` | Create | UI cliente con `fetch()` a `/api/knowledge/summary`. |
| `src/dashboard/index.html` | Create | Shell HTML. |
| `test/api/*.test.ts` | Create | Tests HTTP con fake adapter. |
| `test/dashboard/*.test.ts` | Create | Tests DOM/fetch; falla ante hardcoded data. |

### APIs/contratos

| Endpoint | Respuesta |
|----------|-----------|
| `GET /api/health` | `{ "ok": true, "engram": "available" | "degraded" }` |
| `GET /api/knowledge/summary` | `{ total, by_agent, by_failure_kind, canonical_topic_key, generated_at }` |
| `GET /api/knowledge/records?agent_id=&failure_kind=&limit=` | `{ items: KnowledgeRecord[], next_cursor?: string }` |
| `GET /api/knowledge/records/:id` | `KnowledgeRecord` |
| `POST /api/knowledge/records` | Guarda vía `mem_save` y devuelve `{ id, topic_key }`. |

### Criterios de aceptación verificables

| Criterio | Evidencia |
|----------|-----------|
| `src/api/server.ts` existe y corre. | Test HTTP levanta server in-memory. |
| Dashboard hace `fetch()`. | Test intercepta `/api/knowledge/summary`. |
| No hay literal global tipo `engramData`. | Test estático falla si aparece patrón prohibido. |
| API no inventa datos si Engram falla. | Test devuelve `503` o `degraded`, no datos simulados. |
| CI ejecuta API y dashboard tests. | GitHub Actions verde. |

### Dependencias

Depende de Phase 1 y Phase 2. Conviene ejecutar después de Phase 4 para saber qué métricas mostrar.

### Riesgos técnicos y rollback

| Riesgo | Rollback |
|--------|----------|
| UI se adelanta al backend. | No mergear dashboard si endpoints no pasan tests. |
| Datos sensibles de Engram expuestos. | Filtrar campos por schema público y mantener API local-only por defecto. |

## 8. Estrategia de cierre por fase

Cada fase debe generar un reporte objetivo:

```text
reports/phase{n}/verify-report.json
  command: string
  exit_code: number
  started_at: string
  finished_at: string
  tests_passed: number
  tests_failed: number
  artifacts_checked: string[]
  metrics: object
```

Una fase sin reporte no está cerrada, aunque los documentos digan lo contrario.
