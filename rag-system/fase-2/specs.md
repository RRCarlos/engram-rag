# Specification: Inyección Engram RAG en Agentes SDD (Fase 2)

## Purpose

Define el protocolo técnico para inyectar el bloque `## MANDATORY: Engram RAG Check` en los 5 agentes SDD clave, obligándolos a consultar Engram antes de ejecutar cualquier tarea. Esto materializa el `pattern/agent-rigor-protocol` aprobado en la Fase 1.

## Requirements

### REQ-1: Estructura del Bloque MANDATORY

El sistema DEBE insertar un bloque de sección estándar inmediatamente después del frontmatter YAML y ANTES de la sección `## Purpose` en cada SKILL.md.

El bloque DEBE tener la siguiente estructura exacta (usando marcadores dinámicos):

```markdown
## MANDATORY: Engram RAG Check (Fase 2 - Engram RAG)

**ANTES DE EJECUTAR CUALQUIER TAREA**, DEBES ejecutar:

1. `mem_search(query: "pattern/agent-rigor-protocol", project: "{project}")`
2. Si hay resultados, ejecutar `mem_get_observation(id: {id_del_resultado})` para leer la observación COMPLETA.
3. APLICAR las reglas leídas inmediatamente en tu ejecución.

**Para este agente específico ({agente})**, ejecuta también:
`mem_search(query: "discovery/agent-failure-{agente}", project: "{project}")`

Si existe observación previa, AJUSTA tu comportamiento según la lección aprendida.
Si Engram no responde o no hay observaciones, continúa normalmente (NO falles).

---

```

#### Scenario: Inserción exitosa en sdd-apply
- GIVEN El archivo `Skills/sdd-apply/SKILL.md` existe con frontmatter y `## Purpose`
- WHEN Se inserta el bloque MANDATORY con `{agente}=sdd-apply` y `{project}=engram-rag`
- THEN El archivo contiene `## MANDATORY: Engram RAG Check` antes de `## Purpose`
- AND El marcador `{agente}` se sustituye por `sdd-apply`

#### Scenario: Inserción exitosa en sdd-spec
- GIVEN El archivo `Skills/sdd-spec/SKILL.md` existe con frontmatter y `## Purpose`
- WHEN Se inserta el bloque MANDATORY con `{agente}=sdd-spec` y `{project}=engram-rag`
- THEN El archivo contiene `## MANDATORY: Engram RAG Check` antes de `## Purpose`
- AND El marcador `{agente}` se sustituye por `sdd-spec`

#### Scenario: Inserción exitosa en sdd-design
- GIVEN El archivo `Skills/sdd-design/SKILL.md` existe con frontmatter y `## Purpose`
- WHEN Se inserta el bloque MANDATORY con `{agente}=sdd-design` y `{project}=engram-rag`
- THEN El archivo contiene `## MANDATORY: Engram RAG Check` antes de `## Purpose`
- AND El marcador `{agente}` se sustituye por `sdd-design`

#### Scenario: Inserción exitosa en sdd-verify
- GIVEN El archivo `Skills/sdd-verify/SKILL.md` existe con frontmatter y `## Purpose`
- WHEN Se inserta el bloque MANDATORY con `{agente}=sdd-verify` y `{project}=engram-rag`
- THEN El archivo contiene `## MANDATORY: Engram RAG Check` antes de `## Purpose`
- AND El marcador `{agente}` se sustituye por `sdd-verify`

#### Scenario: Inserción exitosa en sdd-explore
- GIVEN El archivo `Skills/sdd-explore/SKILL.md` existe con frontmatter y `## Purpose`
- WHEN Se inserta el bloque MANDATORY con `{agente}=sdd-explore` y `{project}=engram-rag`
- THEN El archivo contiene `## MANDATORY: Engram RAG Check` antes de `## Purpose`
- AND El marcador `{agente}` se sustituye por `sdd-explore`

### REQ-2: Mapeo de Topic Keys por Agente

El sistema DEBE configurar las búsquedas de Engram con los topic_keys específicos para cada agente:

| Agente | Topic Keys a buscar |
|--------|---------------------|
| sdd-apply | `pattern/agent-rigor-protocol`, `discovery/agent-failure-sdd-apply` |
| sdd-spec | `pattern/agent-rigor-protocol`, `discovery/agent-failure-sdd-spec` |
| sdd-design | `pattern/agent-rigor-protocol`, `discovery/agent-failure-sdd-design` |
| sdd-verify | `pattern/agent-rigor-protocol`, `discovery/agent-failure-sdd-verify` |
| sdd-explore | `pattern/agent-rigor-protocol`, `discovery/agent-failure-sdd-explore` |

#### Scenario: Búsqueda correcta para sdd-apply
- GIVEN El agente sdd-apply inicia su ejecución
- WHEN Ejecuta `mem_search` con query `"discovery/agent-failure-sdd-apply"`
- THEN La búsqueda retorna observaciones específicas de fallos previos de sdd-apply
- AND También busca `pattern/agent-rigor-protocol` para reglas generales

#### Scenario: Búsqueda correcta para sdd-spec
- GIVEN El agente sdd-spec inicia su ejecución
- WHEN Ejecuta `mem_search` con query `"discovery/agent-failure-sdd-spec"`
- THEN La búsqueda retorna observaciones específicas de fallos previos de sdd-spec

### REQ-3: Procedimiento de Inserción Técnica

El sistema DEBE modificar cada SKILL.md usando la herramienta `edit` con el siguiente procedimiento:

1. Leer el archivo completo con `read`
2. Identificar la línea del segundo `---` (fin del frontmatter, típicamente línea 10)
3. Identificar la línea de `## Purpose` (típicamente línea 12)
4. Usar `edit` con:
   - `oldString`: Desde `## Purpose` hasta el inicio del contenido original
   - `newString`: Bloque MANDATORY + `## Purpose` + contenido original

**Ejemplo concreto para sdd-apply:**

```javascript
// oldString (lo que se busca reemplazar):
"## Purpose\n\nYou are a sub-agent responsible for IMPLEMENTATION..."

// newString (lo que se inserta):
"## MANDATORY: Engram RAG Check (Fase 2 - Engram RAG)\n\n**ANTES DE EJECUTAR CUALQUIER TAREA**, DEBES ejecutar:\n\n1. `mem_search(query: \"pattern/agent-rigor-protocol\", project: \"engram-rag\")`\n2. Si hay resultados, ejecutar `mem_get_observation(id: {id_del_resultado})` para leer la observación COMPLETA.\n3. APLICAR las reglas leídas inmediatamente en tu ejecución.\n\n**Para este agente específico (sdd-apply)**, ejecuta también:\n`mem_search(query: \"discovery/agent-failure-sdd-apply\", project: \"engram-rag\")`\n\nSi existe observación previa, AJUSTA tu comportamiento según la lección aprendida.\nSi Engram no responde o no hay observaciones, continúa normalmente (NO falles).\n\n---\n\n## Purpose\n\nYou are a sub-agent responsible for IMPLEMENTATION..."
```

#### Scenario: Edición exitosa con edit tool
- GIVEN El archivo SKILL.md tiene frontmatter en líneas 1-10
- WHEN Se ejecuta `edit` con `oldString` conteniendo `## Purpose` y contenido subsiguiente
- THEN El bloque MANDATORY se inserta correctamente entre el frontmatter y `## Purpose`
- AND No se pierde ningún contenido original del archivo

#### Scenario: Preservación de contenido original
- GIVEN El archivo SKILL.md tiene ~185 líneas (caso sdd-apply)
- WHEN Se inserta el bloque MANDATORY de ~15 líneas
- THEN El archivo resultante tiene ~200 líneas
- AND Todo el contenido original después de `## Purpose` se preserva intacto

### REQ-4: Manejo de Casos de Borde

El sistema DEBE manejar las siguientes condiciones sin fallar:

#### Scenario: Engram no responde
- GIVEN El agente ejecuta `mem_search` y Engram no responde o timeout
- WHEN El agente detecta que no hay respuesta
- THEN El agente CONTINÚA con su tarea normalmente
- AND NO lanza error ni detiene la ejecución

#### Scenario: Topic key no existe
- GIVEN El agente busca `discovery/agent-failure-{agente}` que no existe en Engram
- WHEN `mem_search` retorna resultados vacíos
- THEN El agente continúa normalmente sin aplicar lecciones específicas
- AND NO falla la ejecución

#### Scenario: Ya existe sección MANDATORY
- GIVEN El archivo SKILL.md ya contiene `## MANDATORY: Engram RAG Check`
- WHEN Se intenta insertar el bloque nuevamente
- THEN El sistema NO duplica la sección
- AND Actualiza el contenido existente si es diferente

#### Scenario: Verificación de marcadores dinámicos
- GIVEN Se insertó el bloque en sdd-apply
- WHEN Se lee el archivo resultante
- THEN NO aparece el literal `{agente}` en el texto
- AND NO aparece el literal `{project}` en el texto
- AND Ambos están sustituidos correctamente

### REQ-5: Criterios de Aceptación Post-Inyección

El sistema DEBE verificar que la inyección fue exitosa mediante:

#### Scenario: Verificación de estructura
- GIVEN Se modificó el archivo `Skills/sdd-apply/SKILL.md`
- WHEN Se lee el archivo con `read`
- THEN El archivo contiene exactamente una sección `## MANDATORY: Engram RAG Check`
- AND Dicha sección aparece ANTES de `## Purpose`
- AND Aparece DESPUÉS del segundo `---` del frontmatter

#### Scenario: Verificación de contenido dinámico
- GIVEN Se modificó el archivo `Skills/sdd-spec/SKILL.md`
- WHEN Se lee el archivo
- THEN El texto contiene `sdd-spec` en la línea que menciona "agente específico"
- AND El texto contiene `engram-rag` en las llamadas a `mem_search`
- AND NO hay literales `{agente}` o `{project}`

#### Scenario: Verificación de todos los agentes
- GIVEN Se procesaron los 5 agentes
- WHEN Se verifican todos los archivos
- THEN Los 5 archivos contienen sus respectivos bloques MANDATORY
- AND Cada uno tiene sus topic_keys correctos para ese agente específico

## Coverage Summary

| Requirement | Happy Paths | Edge Cases | Error States |
|-------------|-------------|------------|--------------|
| REQ-1 (Estructura) | 5 scenarios (1 por agente) | Ya existe sección | - |
| REQ-2 (Topic Keys) | 2 scenarios | - | - |
| REQ-3 (Inserción) | 2 scenarios | - | - |
| REQ-4 (Casos Borde) | 4 scenarios | - | - |
| REQ-5 (Aceptación) | 3 scenarios | - | - |

## Next Step

Ready for implementation (sdd-apply). The specs define exactly what to inject and how to inject it.