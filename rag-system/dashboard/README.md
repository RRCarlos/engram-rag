# Engram RAG Dashboard

Dashboard operativo para verificar si Engram RAG esta funcionando con datos reales.

## Que muestra

- Estado de la API local (`/api/health`).
- Estadisticas reales del corpus (`/api/stats`).
- Consultas reales contra RAG lexical, semantic, graph o hybrid (`/api/query`).
- Resultado de evaluaciones RAG (`/api/eval`).
- Reportes historicos de verificacion (`/api/events`).
- Fallos activos detectados por escenarios de evaluacion.

Importante: el dashboard no promete que el agente "arregla solo". Lo que si muestra es si los escenarios fallan, si luego pasan, y que reportes de verificacion existen. Esa diferencia importa: detectar y verificar es medible; "arreglar" requiere una accion de codigo o agente por fuera del dashboard.

## Uso local

Desde la raiz del proyecto:

```bash
npm run dashboard
```

Abrir:

```text
http://localhost:8787
```

## Docker Desktop

Desde la raiz del proyecto:

```bash
docker compose up --build
```

Abrir:

```text
http://localhost:8787
```

## Cloud / InsForge

El proyecto queda listo para cualquier plataforma que acepte contenedores Docker:

- Build command: `docker build -t engram-rag-dashboard .`
- Start command: `npm run dashboard`
- Port: `8787`
- Health endpoint: `/api/health`

Si la plataforma usa `PORT` dinamico, el servidor lo respeta mediante la variable de entorno `PORT`.
