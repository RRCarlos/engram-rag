# 🎯 Prompt para Continuar Engram RAG (Próxima Sesión)

**Copia y pega esto en OpenCode para retomar el proyecto Engram RAG Fase 2:**

---

"Hola OpenCode. Continuamos con el proyecto **Engram RAG for Agent Improvement**.

**CONTEXTO YA COMPLETADO:**
1. **Fase 1 (Documentación/Protocolos)**: Completada. 
   - Repositorio: `RRCarlos/engram-rag` (Privado).
   - Charter: `rag-system/charter.md` (Subido).
   - Propuesta Fase 2: `rag-system/fase-2-proposal.md` (Subido).
   - Protocolo guardado en Engram: `topic_key: pattern/agent-rigor-protocol-v1-master`.

2. **ESTAMOS AQUÍ**: Aprobada la **Fase 2: Inyección en Agentes SDD**.
   - Objetivo: Modificar las Skills de 5 agentes (`sdd-apply`, `sdd-spec`, etc.) para que consulten Engram RAG antes de actuar.
   - Propuesta detallada en Engram ID #144 (`sdd/engram-rag-fase-2/proposal`).

**TU TAREA AHORA:**
Lanza el agente `sdd-spec` para crear las **Especificaciones Técnicas (Fase 2)**.
- Debe definir EXACTAMENTE cómo insertar la sección `## MANDATORY: Engram RAG Check` en cada Skill.
- Debe especificar los `topic_keys` a buscar por cada agente.
- Guarda las specs en Engram (`project: engram-rag`) y súbelas a `RRCarlos/engram-rag/rag-system/fase-2/specs.md`.

**NO EMPIECES DE CERO. El trabajo previo está en `RRCarlos/engram-rag` y en Engram (`project: engram-rag`).**"

---

## Archivos Clave donde estamos:
- GitHub: `RRCarlos/engram-rag/rag-system/`
- Engram: `project: engram-rag`, topic: `sdd/engram-rag-fase-2/proposal`

## Próximo paso tras este prompt:
- `sdd-spec` (Fase 2: Especificaciones de inyección)
- `sdd-apply` (Modificar Skills)
- `sdd-verify` (Auditar inyección)
