# Change Proposal: Engram RAG - Fase 2 (Inyección en Agentes)

## Intent
Inyectar el protocolo de rigor (RAG check) en 5 agentes SDD mediante la modificación de sus SKILL.md, para que consulten Engram obligatoriamente antes de actuar. Esto materializa el "agent-rigor-protocol-v1-master" aprobado en la Fase 1.

## Scope
### Incluye:
- **Modificación de 5 Skills (Agentes SDD)**:
  1. `sdd-apply` → `Skills/sdd-apply/SKILL.md`
  2. `sdd-spec` → `Skills/sdd-spec/SKILL.md`
  3. `sdd-design` → `Skills/sdd-design/SKILL.md`
  4. `sdd-verify` → `Skills/sdd-verify/SKILL.md`
  5. `sdd-explore` → `Skills/sdd-explore/SKILL.md`

- **Topic_keys a usar para cada agente**:
  - `pattern/agent-rigor-protocol` (protocolo general)
  - `discovery/agent-failure-sdd-apply`
  - `discovery/agent-failure-sdd-spec`
  - `discovery/agent-failure-sdd-design`
  - `discovery/agent-failure-sdd-verify`
  - `discovery/agent-failure-sdd-explore`

### Excluye:
- Modificación del runner de OpenCode.
- Cambios en mi (Orquestador) comportamiento.
- Modificación de agentes fuera del ciclo SDD.

## Approach

### Paso 1: Crear Template de Inyección
Crear el bloque estándar que se insertará al inicio de CADA SKILL.md:

```markdown
## MANDATORY: Engram RAG Check (Fase 2 - Engram RAG)

**ANTES DE EJECUTAR CUALQUIER TAREA**, ejecuta:
1. `mem_search(query: "pattern/agent-rigor-protocol", project: "{project}")`
2. `mem_search(query: "discovery/agent-failure-{agente}", project: "{project}")`
3. Lee las observaciones devueltas con `mem_get_observation(id: {id})`.
4. APLICA las reglas leídas (ej: NO usar `&&`, verificar después de escribir).

Si no hay observación previa, continúa normalmente. Si existe, AJUSTA tu comportamiento según la lección aprendida.
```

### Paso 2: Modificar sdd-apply/SKILL.md
- Insertar la sección `## MANDATORY: Engram RAG Check` después del frontmatter (línea 10, antes de `## Purpose`).
- Sustituir `{agente}` por `sdd-apply`.

### Paso 3: Modificar sdd-spec/SKILL.md
- Insertar la sección `## MANDATORY: Engram RAG Check` después del frontmatter.
- Sustituir `{agente}` por `sdd-spec`.

### Paso 4: Modificar sdd-design/SKILL.md
- Insertar la sección `## MANDATORY: Engram RAG Check` después del frontmatter.
- Sustituir `{agente}` por `sdd-design`.

### Paso 5: Modificar sdd-verify/SKILL.md
- Insertar la sección `## MANDATORY: Engram RAG Check` después del frontmatter.
- Sustituir `{agente}` por `sdd-verify`.

### Paso 6: Modificar sdd-explore/SKILL.md
- Insertar la sección `## MANDATORY: Engram RAG Check` después del frontmatter.
- Sustituir `{agente}` por `sdd-explore`.

## ¿Qué va a pasar cuando un agente trabaje? (Para RRCarlos)

Imagina que tú (el orquestador) lanzas `sdd-apply` para que implemente una tarea que requiere ejecutar comandos Bash en PowerShell:

1. **El agente lee su SKILL.md** (cargado automáticamente por OpenCode al invocar el skill).
2. **El agente ve la sección `## MANDATORY: Engram RAG Check`** en letras capitalized al inicio.
3. **El agente ejecuta** `mem_search('pattern/agent-rigor-protocol')`.
4. **Engram devuelve** el ID de la observación "agent-rigor-protocol-v1-master".
5. **El agente lee** con `mem_get_observation(id)` que: 'NO uses `&&` en Bash (PowerShell no lo soporta nativamente)'.
6. **El agente recibe la tarea**: "Ejecuta `cd foo && npm install`".
7. **El agente, al recordar la regla**, transforma el comando a: `cd foo; if ($?) { npm install }`.
8. **Resultado**: El comando funciona en PowerShell, no falla, y el Orquestador (tú) no tiene que intervenir ni corregir.

**El RAG check actúa como una "memoria de largo plazo" que previene errores repetitivos.** Sin esto, el agente repetiría el error de usar `&&` cada vez que se reinicie la conversación.

## Success Metrics
- **% Agentes modificados que ejecutan `mem_search` al inicio**: 100% (los 5 agentes deben tener el MANDATORY).
- **Reducción de fallos de PowerShell por `&&`**: Meta 90% menos errores tras la inyección.
- **% Agentes que leen `mem_get_observation` completa**: 100% (no usar solo el preview de `mem_search`).

## Affected Areas
| Area | Impact | Description |
|------|--------|-------------|
| `Skills/sdd-apply/SKILL.md` | Modified | Inyección de RAG Check MANDATORY |
| `Skills/sdd-spec/SKILL.md` | Modified | Inyección de RAG Check MANDATORY |
| `Skills/sdd-design/SKILL.md` | Modified | Inyección de RAG Check MANDATORY |
| `Skills/sdd-verify/SKILL.md` | Modified | Inyección de RAG Check MANDATORY |
| `Skills/sdd-explore/SKILL.md` | Modified | Inyección de RAG Check MANDATORY |

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Romper Skills existentes al insertar texto | Medium | Edición quirúrgica: insertar SOLO después del frontmatter, verificar sintaxis Markdown. |
| Agentes ignoran el MANDATORY | Low | Lenguaje OBLIGATORIO en Mayúsculas, posicionado al inicio del archivo (primera sección después de metadatos). |
| Topic_key incorrecto en `mem_search` | Medium | Usar siempre `pattern/agent-rigor-protocol` exacto, verificar en Engram antes de escribir. |
| Agentes no usan `mem_get_observation` | Medium | Especificar explícitamente en el MANDATORY: "Lee la observación COMPLETA". |

## Rollback Plan
1. **Hacer backup** de los 5 archivos SKILL.md antes de modificar (guardar en `Skills/backup/`).
2. Si la inyección causa errores, **revertir manualmente** copiando los archivos de backup sobre los modificados.
3. Si Engram falla, los agentes simplemente no encontrarán observaciones y continuarán con su comportamiento por defecto (sin RAG).

## Dependencies
- **Engram activo** con `pattern/agent-rigor-protocol` ya guardado (Fase 1 completada).
- **OpenCode** cargando SKILL.md automáticamente al invocar skills.

## Success Criteria
- [ ] Los 5 archivos SKILL.md contienen la sección `## MANDATORY: Engram RAG Check`.
- [ ] Cada sección referencia correctamente `pattern/agent-rigor-protocol` y `discovery/agent-failure-{agente}`.
- [ ] Los agentes modificados ejecutan `mem_search` antes de actuar (verificable lanzando un agente y observando los logs de herramientas).
- [ ] Reducción medible de errores de sintaxis Bash (PowerShell) en sesiones posteriores.
