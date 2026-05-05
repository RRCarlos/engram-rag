# Project Charter: Engram RAG for Agent Improvement

## Propósito

Mejorar la eficacia, rigor y consistencia de los sub-agentes SDD (sdd-apply, sdd-spec, sdd-design, sdd-verify, etc.) mediante la implementación de un sistema **RAG (Retrieval-Augmented Generation)** basado en **Engram**, el sistema de memoria persistente. El objetivo es que los agentes consulten lecciones aprendidas, errores pasados y protocolos de rigor **antes y durante** su ejecución, reduciendo fallos repetitivos en verificación, compatibilidad de entorno (PowerShell vs Linux), y manejo de archivos.

**Concepto de Engram RAG para este proyecto:**
- **Retrieval (Recuperación)**: Al iniciar una tarea, el sub-agente ejecuta `mem_search` con queries contextuales (ej: "bugfix powershell", "protocol verify after write") o topic_keys estructurados.
- **Augmented (Aumentado)**: El contexto recuperado (observaciones de Engram con **What, Why, Where, Learned**) se inyecta en el razonamiento del agente como "lecciones previas".
- **Generation (Generación)**: El agente produce su salida (código, especificaciones, diseño) aplicando las lecciones recuperadas, evitando repetir errores documentados.

**Flujo de datos:**
```
Sub-agente inicia → Ejecuta mem_search(topic_key: "protocol/rigor") → 
Recibe observaciones previas → Inyecta en su contexto → 
Ejecuta tarea aplicando lecciones → Guarda nuevos hallazgos via mem_save
```

## Alcance

### Incluye:
- Definición de taxonomía de `topic_keys` para lecciones de agentes (ej: `protocol/rigor`, `bugfix/powershell-compat`, `discovery/large-files-github`)
- Modificación de `sdd-phase-common.md` para inyectar búsqueda obligatoria de contexto al inicio de cada fase
- Creación de documento `agent-rigor-protocol.md` como referencia rápida (cargable como skill)
- Implementación de checklist de verificación post-escritura en agentes que escriben código (`sdd-apply`, `sdd-spec`)
- Medición de eficacia mediante métricas definidas
- Documentación de lecciones aprendidas en Engram con formato estructurado

### Excluye:
- Modificación del runner/orquestador principal de OpenCode (no se creará middleware externo)
- Implementación de búsqueda semántica (se usará FTS5 existente en Engram, no embeddings vectoriales)
- Cambios en la interfaz de usuario de OpenCode
- Integración con sistemas externos de memoria (solo Engram local)

## Fases del Proyecto

### Fase 1: Documentación y Protocolos de Rigor
- **Objetivo**: Formalizar las lecciones aprendidas y crear el protocolo de rigor que los agentes deben seguir
- **Entregables**:
  1. Documento `agent-rigor-protocol.md` con reglas obligatorias (verify-after-write, check PowerShell compatibility, handle large files via pagination)
  2. Taxonomía de `topic_keys` documentada (ej: `protocol/rigor/v1`, `bugfix/powershell-compat`, `discovery/agent-failure`)
  3. Observaciones estructuradas en Engram con las lecciones mencionadas (usando `mem_save` con topic_keys estables)
  4. Modificación de `sdd-phase-common.md` (sección B - Artifact Retrieval) para incluir búsqueda obligatoria de rigor
- **Métrica de éxito**: 100% de protocolos documentados y guardados en Engram con topic_keys accesibles

### Fase 2: Inyección en Agentes SDD
- **Objetivo**: Modificar los SKILL.md de los sub-agentes para que consulten Engram antes de actuar
- **Entregables**:
  1. Actualización de `sdd-apply/SKILL.md` con sección de búsqueda pre-emptiva y checklist post-escritura
  2. Actualización de `sdd-spec/SKILL.md` con verificación de rigor y compatibilidad
  3. Actualización de `sdd-verify/SKILL.md` como "punto de control" obligatorio en el pipeline
  4. Actualización de `sdd-design/SKILL.md` con búsqueda de patrones arquitectónicos previos
  5. Guía de "Skill Loading" actualizada en `skill-registry.md`
- **Métrica de éxito**: 5 agentes principales modificados, cada uno con instrucciones de búsqueda en Engram al inicio

### Fase 3: Medición de Eficacia y Refinamiento
- **Objetivo**: Ejecutar pruebas controladas y medir si el RAG reduce fallos
- **Entregables**:
  1. Conjunto de pruebas "baseline" (tareas que históricamente han fallado)
  2. Ejecución de las mismas tareas con y sin RAG (A/B testing)
  3. Reporte de métricas comparativas
  4. Refinamiento de queries de búsqueda y topic_keys basado en resultados
- **Métrica de éxito**: Reducción del 50% o más en fallos de rigor/verificación en las tareas de prueba

## Métricas de Éxito (Generales)

1. **% Reducción de fallos repetitivos**: Disminución en errores de mismo tipo (ej: PowerShell incompatibility, no-verify-after-write)
2. **% Agentes que consultan Engram**: De 0% (actual) a 100% (objetivo) en agentes modificados
3. **Tiempo de recuperación de contexto**: Latencia de `mem_search` + `mem_get_observation` < 2 segundos
4. **Cobertura de protocolos**: 100% de los escenarios de fallo identificados tienen un protocolo correspondiente en Engram
5. **Satisfacción del orquestador**: Reducción en necesidad de re-ejecutar tareas o corregir manual

## Riesgos y Mitigación

| Riesgo | Impacto | Probabilidad | Mitigación |
|--------|---------|--------------|------------|
| Modificar SKILL.md de agentes en producción rompe flujos existentes | Alto | Media | Probar en proyecto de prueba (ej: hextrike-analysis) antes de despliegue general |
| Búsquedas FTS5 imprecisas (keywords vs semántica) | Medio | Alta | Usar topic_keys estructurados y queries específicas; documentar queries efectivas |
| Agentes ignoran protocolo si no está reforzado | Alto | Media | Incluir en sección `## Rules` con lenguaje obligatorio ("MUST", "MANDATORY") |
| Engram no disponible en algunas sesiones | Medio | Baja | Protocolo "optional but recommended" con fallback a comportamiento estándar; advertir en SKILL.md |
| Sobrecarga de búsquedas (latencia) | Bajo | Media | Cachear observaciones frecuentes; usar `mem_context` para sesiones recientes antes que `mem_search` |
| Drift de protocolos (se vuelven obsoletos) | Medio | Media | `mem_save` con `topic_key` permite upserts; revisar mensualmente |

## Siguiente Paso

¿Aprobación del Charter para proceder a **sdd-propose** (Fase 2: Inyección en Agentes)?
