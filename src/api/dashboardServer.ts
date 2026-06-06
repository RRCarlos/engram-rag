import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chunkDocuments } from "../rag/chunker.js";
import { loadCorpusDocuments } from "../rag/corpusLoader.js";
import { resolveEmbedder } from "../rag/embedder/registry.js";
import { buildGraphIndex } from "../rag/graphIndex/store.js";
import { retrieveHybrid } from "../rag/hybridRetriever.js";
import { evaluateRagScenarios, loadRagEvalScenarios, type RagEvalOptions } from "../rag/ragEval.js";
import { retrieveChunks } from "../rag/retriever.js";
import { computeCorpusHash } from "../rag/semanticRetriever.js";
import type { RetrievalMode } from "../contracts/rag.js";

const rootDir = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const dashboardDir = join(rootDir, "rag-system", "dashboard");
const defaultCorpusDir = join(rootDir, "fixtures", "corpus");
const defaultScenarioFile = join(rootDir, "eval", "rag-scenarios", "hybrid.json");
const graphDictionary = ["alpha", "beta", "gamma", "delta", "retrieval", "ranking", "lexical", "citations"];

type JsonValue = Record<string, unknown> | unknown[];

function sendJson(response: ServerResponse, statusCode: number, payload: JsonValue): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendError(response: ServerResponse, statusCode: number, error: unknown): void {
  sendJson(response, statusCode, {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  });
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {};
  }
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Request body must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function asMode(value: unknown): RetrievalMode {
  if (value === "lexical" || value === "semantic" || value === "graph" || value === "hybrid") {
    return value;
  }
  return "hybrid";
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

async function getCorpus(corpusDir = defaultCorpusDir) {
  const documents = await loadCorpusDocuments(corpusDir);
  const chunks = chunkDocuments(documents, { maxCharacters: 256 });
  const corpusHash = computeCorpusHash(chunks);
  return { documents, chunks, corpusHash, corpusDir };
}

async function buildEval(mode: RetrievalMode, scenarioFile = defaultScenarioFile) {
  const scenarios = await loadRagEvalScenarios(scenarioFile);
  const { chunks, corpusHash } = await getCorpus();
  const options: RagEvalOptions = { defaultMode: mode };
  if (mode !== "lexical") {
    const embedder = resolveEmbedder("hashing");
    options.embedder = embedder;
    options.corpusHash = corpusHash;
    options.graphDictionary = graphDictionary;
    options.prebuiltEntries = chunks.map((chunk) => ({ id: chunk.id, vector: embedder.embed(chunk.text) }));
    options.prebuiltGraph = buildGraphIndex(chunks, { corpusHash, dictionary: graphDictionary });
  }
  return evaluateRagScenarios(scenarios, chunks, options);
}

async function readReportEvents() {
  const reportsRoot = join(rootDir, "reports");
  const phases = await readdir(reportsRoot, { withFileTypes: true }).catch(() => []);
  const events = [];
  for (const phase of phases.filter((entry) => entry.isDirectory())) {
    const phaseDir = join(reportsRoot, phase.name);
    const files = await readdir(phaseDir).catch(() => []);
    for (const file of files.filter((name) => name.endsWith(".json"))) {
      const path = join(phaseDir, file);
      const raw = await readFile(path, "utf8").catch(() => "{}");
      const parsed = JSON.parse(raw || "{}");
      const passed = Boolean(parsed.ok ?? parsed.success ?? parsed.pass ?? parsed.scenarios_passed === parsed.scenarios_total);
      events.push({
        phase: phase.name,
        file,
        status: passed ? "PASS" : "CHECK",
        path: normalize(path).replaceAll("\\\\", "/"),
        summary: parsed.summary ?? parsed.status ?? parsed.result ?? null,
      });
    }
  }
  return events.sort((a, b) => `${b.phase}/${b.file}`.localeCompare(`${a.phase}/${a.file}`));
}

async function handleApi(request: IncomingMessage, response: ServerResponse, pathname: string): Promise<void> {
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      service: "engram-rag-dashboard",
      version: "2.0.0",
      uptime_seconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (pathname === "/api/stats") {
    const { documents, chunks, corpusHash, corpusDir } = await getCorpus();
    const evalReport = await buildEval("hybrid").catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
    const events = await readReportEvents();
    sendJson(response, 200, {
      ok: true,
      corpus: {
        directory: corpusDir,
        hash: corpusHash,
        documents: documents.length,
        chunks: chunks.length,
        total_chars: documents.reduce((sum, document) => sum + document.text.length, 0),
      },
      retrieval: {
        modes: ["lexical", "semantic", "graph", "hybrid"],
        default_mode: "hybrid",
        embedder: "hashing",
      },
      eval: evalReport,
      events,
    });
    return;
  }

  if (pathname === "/api/query" && request.method === "POST") {
    const body = await readBody(request);
    const query = asString(body.query, "retrieval citations");
    const topK = asNumber(body.top_k, 5);
    const mode = asMode(body.mode);
    const { chunks, corpusHash } = await getCorpus(asString(body.corpus_dir, defaultCorpusDir));
    const embedder = resolveEmbedder("hashing");
    const results = mode === "lexical"
      ? retrieveChunks({ text: query, top_k: topK }, chunks)
      : retrieveHybrid(
        { text: query, top_k: topK },
        chunks,
        {
          mode,
          embedder,
          corpusHash,
          prebuiltEntries: chunks.map((chunk) => ({ id: chunk.id, vector: embedder.embed(chunk.text) })),
          prebuiltGraph: buildGraphIndex(chunks, { corpusHash, dictionary: graphDictionary }),
        },
      );
    sendJson(response, 200, { ok: true, ...results, query, mode });
    return;
  }

  if (pathname === "/api/eval") {
    const mode = asMode(new URL(request.url ?? "/", "http://localhost").searchParams.get("mode"));
    sendJson(response, 200, { ok: true, mode, report: await buildEval(mode) });
    return;
  }

  if (pathname === "/api/events") {
    sendJson(response, 200, { ok: true, events: await readReportEvents() });
    return;
  }

  sendJson(response, 404, { ok: false, error: `Unknown endpoint: ${pathname}` });
}

async function serveStatic(response: ServerResponse, pathname: string): Promise<void> {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const safePath = normalize(requestedPath).replace(/^([.][.][\\/])+/, "");
  const absolutePath = resolve(join(dashboardDir, safePath));
  if (!absolutePath.startsWith(dashboardDir)) {
    sendJson(response, 403, { ok: false, error: "Forbidden" });
    return;
  }
  const stats = await stat(absolutePath).catch(() => null);
  if (!stats?.isFile()) {
    sendJson(response, 404, { ok: false, error: "Not found" });
    return;
  }
  const contentType = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
  }[extname(absolutePath)] ?? "application/octet-stream";
  response.writeHead(200, { "content-type": contentType });
  createReadStream(absolutePath).pipe(response);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url.pathname);
      return;
    }
    await serveStatic(response, url.pathname);
  } catch (error) {
    sendError(response, 500, error);
  }
});

const port = Number(process.env.PORT ?? 8787);
server.listen(port, () => {
  console.log(`Engram RAG dashboard listening on http://localhost:${port}`);
});
