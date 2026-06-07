import { z } from "zod";
import {
  CANONICAL_PROTOCOL_TOPIC_KEY,
  assertNoForbiddenTopicAliases,
} from "../contracts/topicKeys.js";
import { AgentIdSchema, type KnowledgeRecord } from "../contracts/knowledgeRecord.js";
import { KnowledgeRecordSchema } from "../contracts/knowledgeRecord.js";
import type {
  EngramTools,
  MemContextInput,
  MemContextResult,
  MemGetObservationInput,
  MemObservation,
  MemSaveInput,
  MemSaveResult,
  MemSearchInput,
  MemSearchResult,
  QuarantinedRecord,
} from "./EngramTools.js";

/** Live HTTP adapter for EngramTools; uses Node 20 global fetch and zero deps. */

export const LIVE_ENGRAM_METHODS = [
  "mem_context",
  "mem_search",
  "mem_get_observation",
  "mem_save",
] as const;

export type LiveEngramMethod = (typeof LIVE_ENGRAM_METHODS)[number];

export interface LiveEngramCall {
  method: LiveEngramMethod;
  input: unknown;
  at: string;
}

export interface LiveEngramAdapterOptions {
  baseUrl: string;
  project: string;
  scope: "project" | "personal";
  sessionId?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => Date;
}

export interface LiveEngramAdapter extends EngramTools {
  getCallLog(): LiveEngramCall[];
  resetCallLog(): void;
  getQuarantinedRecords(): QuarantinedRecord[];
  healthCheck(): Promise<boolean>;
  getSessionId(): string | undefined;
}

export class LiveEngramError extends Error {
  constructor(
    message: string,
    readonly method?: LiveEngramMethod,
    cause?: unknown,
  ) {
    super(message);
    this.name = "LiveEngramError";
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

export class LiveEngramParseError extends LiveEngramError {
  constructor(
    message: string,
    readonly observationId: number,
    method?: LiveEngramMethod,
  ) {
    super(message, method);
    this.name = "LiveEngramParseError";
  }
}

const RawObservationSchema = z
  .object({
    id: z.number().int().positive(),
    sync_id: z.string().min(1),
    session_id: z.string().min(1),
    type: z.string().min(1),
    title: z.string().min(1),
    content: z.string(),
    topic_key: z.string().min(1).optional(),
    created_at: z.string().optional(),
  })
  .passthrough();
export type RawObservation = z.infer<typeof RawObservationSchema>;

const RawSessionSchema = z
  .object({
    id: z.string().min(1).optional(),
    session_id: z.string().min(1).optional(),
    sessionId: z.string().min(1).optional(),
  })
  .passthrough();

const RawSaveObservationSchema = z
  .object({
    id: z.number().int().positive(),
    topic_key: z.string().min(1).optional(),
    created_at: z.string().optional(),
  })
  .passthrough();

const RawHealthSchema = z
  .object({
    status: z.string().min(1).optional(),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Defaults and helpers.
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 5000;
const MAX_CONTEXT_OBSERVATIONS = 20;
const DEFAULT_AGENT_ID: z.infer<typeof AgentIdSchema> = "sdd-apply";

const STOPWORDS: ReadonlySet<string> = new Set([
  "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "al",
  "y", "o", "u", "en", "por", "para", "con", "sin", "que", "como", "es",
  "son", "ser", "estar", "este", "esta", "estos", "estas", "ese", "esa",
  "esos", "esas", "aquel", "aquella", "the", "and", "for", "with", "from",
  "this", "that", "what", "why", "where", "when", "how", "into", "onto",
  "sobre", "tras", "ante", "entre", "hacia", "hasta", "desde", "porque",
  "intento", "intento", "ejecutar", "fallo", "fall", "try", "ran", "did",
  "not", "can", "could", "should", "would", "may", "might", "must",
]);

function nowIso(now: () => Date): string {
  return now().toISOString();
}

function deriveTopicKey(raw: RawObservation): string {
  if (raw.topic_key) return raw.topic_key;
  return `engram-rag/observation/${raw.id}`;
}

function buildEvidenceRefs(raw: RawObservation): string[] {
  return [`engram://observation/${raw.id}`, `engram://sync/${raw.sync_id}`];
}

function extractMarkdownField(content: string, key: string): string {
  const re = new RegExp(
    `\\*\\*${key}\\*\\*[:：]?\\s*([\\s\\S]+?)(?=\\n\\s*\\*\\*[A-Za-zÁ-ú]+\\*\\*[:：]|\\n\\n|$)`,
  );
  const m = content.match(re);
  return m?.[1]?.trim() ?? "";
}

export function parseEngramContentToRecord(
  raw: RawObservation,
  now: () => Date = () => new Date(),
): KnowledgeRecord {
  const content = raw.content ?? "";

  const jsonRecord = (() => {
    const trimmed = content.trim();
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const result = KnowledgeRecordSchema.safeParse(parsed);
      return result.success ? result.data : null;
    } catch {
      return null;
    }
  })();
  if (jsonRecord !== null) {
    assertNoForbiddenTopicAliases(jsonRecord.topic_key);
    return jsonRecord;
  }

  const what = extractMarkdownField(content, "What");
  const why = extractMarkdownField(content, "Why") || what;
  const where = extractMarkdownField(content, "Where");

  // Agent id — try multiple heuristics.
  const agentMatch =
    content.match(/(?:agente|agent)\s+([a-z][a-z0-9-]+)/i) ??
    content.match(/`([a-z][a-z0-9-]+)`\s+(?:intentó|try|attempted|ran)/i) ??
    raw.title.match(/`?([a-z][a-z0-9-]+)`?/);
  const candidate = (agentMatch?.[1] ?? "").toLowerCase();
  const agent_id = (AgentIdSchema.safeParse(candidate).success
    ? candidate
    : DEFAULT_AGENT_ID) as z.infer<typeof AgentIdSchema>;

  // Failure kind — try to infer from keywords.
  let failure_kind: z.infer<typeof KnowledgeRecordSchema.shape.failure_kind> = "shell";
  if (/gherkin|scenario|spec/i.test(content)) failure_kind = "spec";
  else if (/frontmatter|skill|convention/i.test(content)) failure_kind = "convention";
  else if (/dise[ñn]o|design/i.test(content)) failure_kind = "design";
  else if (/verific|verify/i.test(content)) failure_kind = "verification";
  else if (/workflow/i.test(content)) failure_kind = "workflow";

  // Failure signature — first 200 chars of the What field, stripped of backticks.
  const cleanedWhat = what.replace(/`/g, "").replace(/\s+/g, " ").trim();
  const failure_signature =
    cleanedWhat.length > 0 ? cleanedWhat.slice(0, 200) : raw.title;

  // Trigger terms — explicit list when present, otherwise significant words
  // pulled from the WHOLE body (not just the What field), with title included.
  const explicitTriggers = (() => {
    const m = content.match(/trigger[_ ]?terms?[:：]\s*([^\n]+)/i);
    if (!m) return [] as string[];
    return (m[1] ?? "")
      .split(/[,\s]+/)
      .map((term) => term.trim().toLowerCase())
      .filter(Boolean);
  })();
  const bodyWords = content
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter((w) => w.length >= 4)
    .filter((w) => !STOPWORDS.has(w));
  const titleWords = raw.title
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter((w) => w.length >= 4)
    .filter((w) => !STOPWORDS.has(w));
  const deduped = [...new Set([...titleWords, ...bodyWords])];
  const trigger_terms =
    explicitTriggers.length > 0
      ? explicitTriggers.slice(0, 12)
      : deduped.slice(0, 8);

  // Validated solution — prefer the Why field, else What.
  const validated_solution = (why || cleanedWhat).slice(0, 800);

  const topic_key = deriveTopicKey(raw);
  assertNoForbiddenTopicAliases(topic_key);

  return KnowledgeRecordSchema.parse({
    schema_version: "2.0",
    topic_key,
    canonical_protocol_topic_key: CANONICAL_PROTOCOL_TOPIC_KEY,
    agent_id,
    failure_kind,
    failure_signature,
    trigger_terms: trigger_terms.length > 0 ? trigger_terms : [agent_id],
    validated_solution: validated_solution || raw.title,
    evidence_refs: where
      ? [...buildEvidenceRefs(raw), where]
      : buildEvidenceRefs(raw),
    validation_status: "draft",
    last_validated_at: nowIso(now),
  });
}

export function rawToSearchResult(
  raw: RawObservation,
  query: string,
  rank: number,
  now: () => Date = () => new Date(),
): MemSearchResult {
  const record = parseEngramContentToRecord(raw, now);
  const queryTerms = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const matched = record.trigger_terms.filter((term) => {
    const lower = term.toLowerCase();
    return queryTerms.some((qt) => lower.includes(qt) || qt.includes(lower));
  });
  const trigger_terms = matched.length > 0 ? matched : record.trigger_terms;
  // Rank-based score in (0, 1] — first hit is 1.0, then 0.9, 0.8, ...
  const score = Math.max(0.1, 1.0 - rank * 0.1);
  return {
    id: raw.id,
    topic_key: record.topic_key,
    agent_id: record.agent_id,
    failure_signature: record.failure_signature,
    trigger_terms,
    score,
  };
}

// ---------------------------------------------------------------------------
// Adapter factory.
// ---------------------------------------------------------------------------

export function createLiveAdapter(
  options: LiveEngramAdapterOptions,
): LiveEngramAdapter {
  const {
    baseUrl,
    project,
    scope,
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    now = () => new Date(),
  } = options;

  if (!baseUrl || typeof baseUrl !== "string") {
    throw new LiveEngramError("baseUrl is required");
  }
  if (!project || typeof project !== "string") {
    throw new LiveEngramError("project is required");
  }
  if (scope !== "project" && scope !== "personal") {
    throw new LiveEngramError(`scope must be "project" or "personal", got ${scope}`);
  }

  let sessionId = options.sessionId;
  const calls: LiveEngramCall[] = [];
  const quarantinedRecords: QuarantinedRecord[] = [];
  const log = (method: LiveEngramMethod, input: unknown) => {
    calls.push({ method, input, at: nowIso(now) });
  };
  const quarantine = (record: QuarantinedRecord) => {
    if (!quarantinedRecords.some((existing) => existing.id === record.id && existing.source === record.source)) {
      quarantinedRecords.push(record);
    }
  };

  async function http<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${baseUrl.replace(/\/+$/, "")}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const init: RequestInit = {
        method,
        signal: controller.signal,
        headers: { Accept: "application/json" },
      };
      if (body !== undefined) {
        (init.headers as Record<string, string>)["Content-Type"] = "application/json";
        init.body = JSON.stringify(body);
      }
      let response: Response;
      try {
        response = await fetchImpl(url, init);
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") {
          throw new LiveEngramError(`Timeout after ${timeoutMs}ms on ${method} ${path}`);
        }
        throw new LiveEngramError(
          `Network error on ${method} ${path}: ${(err as Error).message ?? err}`,
          undefined,
          err,
        );
      }
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new LiveEngramError(
          `HTTP ${response.status} on ${method} ${path}: ${text.slice(0, 200)}`,
        );
      }
      const text = await response.text();
      if (text.length === 0) {
        return undefined as T;
      }
      try {
        return JSON.parse(text) as T;
      } catch (err) {
        throw new LiveEngramError(
          `Invalid JSON on ${method} ${path}: ${text.slice(0, 200)}`,
          undefined,
          err,
        );
      }
    } finally {
      clearTimeout(timer);
    }
  }

  async function ensureSession(): Promise<string> {
    if (sessionId) return sessionId;
    const data = await http<unknown>("POST", "/sessions", { project, scope });
    const parsed = RawSessionSchema.safeParse(data);
    if (!parsed.success) {
      throw new LiveEngramError(
        `POST /sessions returned unexpected shape: ${JSON.stringify(data).slice(0, 200)}`,
      );
    }
    const newId = parsed.data.session_id ?? parsed.data.sessionId ?? parsed.data.id;
    if (!newId) {
      throw new LiveEngramError("POST /sessions returned no session id");
    }
    sessionId = newId;
    return sessionId;
  }

  return {
    async mem_context(input: MemContextInput): Promise<MemContextResult> {
      log("mem_context", input);
      // The HTTP /context endpoint returns a context blob without
      // observation ids, so we probe /health instead and treat the
      // call as a connectivity check. The preflight runner only
      // inspects the boolean "did it throw" outcome, not the
      // observation list. We return an empty list (plus the
      // generated_at timestamp) to satisfy the strict schema.
      await http<unknown>("GET", "/health");
      // Best-effort: also fetch a search hit-list so the caller can
      // surface recent context observations. The preflight ignores
      // the body, but future consumers can use it.
      try {
        const recent = await http<unknown[]>(
          "GET",
          `/search?q=${encodeURIComponent("*")}&project=${encodeURIComponent(project)}&scope=${scope}&limit=${MAX_CONTEXT_OBSERVATIONS}`,
        );
        if (Array.isArray(recent)) {
          const observations = recent
            .map((entry) => {
              const parsed = RawObservationSchema.safeParse(entry);
              if (!parsed.success) return null;
              const record = parseEngramContentToRecord(parsed.data, now);
              return {
                id: parsed.data.id,
                topic_key: record.topic_key,
                summary: record.failure_signature,
              };
            })
            .filter((o): o is { id: number; topic_key: string; summary: string } => o !== null);
          return { observations, generated_at: nowIso(now) };
        }
      } catch {
        // fall back to empty context
      }
      return { observations: [], generated_at: nowIso(now) };
    },

    async mem_search(input: MemSearchInput): Promise<MemSearchResult[]> {
      log("mem_search", input);
      const params = new URLSearchParams({
        q: input.query,
        project,
        scope,
        limit: String(input.limit),
      });
      const data = await http<unknown[]>("GET", `/search?${params.toString()}`);
      if (!Array.isArray(data)) {
        throw new LiveEngramError(
          `GET /search returned non-array: ${JSON.stringify(data).slice(0, 200)}`,
        );
      }
      const results: MemSearchResult[] = [];
      for (let i = 0; i < data.length; i += 1) {
        const parsed = RawObservationSchema.safeParse(data[i]);
        if (!parsed.success) continue;
        try {
          results.push(rawToSearchResult(parsed.data, input.query, i, now));
        } catch (err) {
          const reason = err instanceof z.ZodError
            ? `Failed to map observation ${parsed.data.id} to KnowledgeRecord: ${err.issues
                .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
                .join("; ")}`
            : (err as Error).message;
          quarantine({ id: parsed.data.id, reason, source: "search" });
        }
      }
      return results;
    },

    async mem_get_observation(input: MemGetObservationInput): Promise<MemObservation> {
      log("mem_get_observation", input);
      const data = await http<unknown>("GET", `/observations/${input.id}`);
      const parsed = RawObservationSchema.safeParse(data);
      if (!parsed.success) {
        throw new LiveEngramError(
          `GET /observations/${input.id} returned unexpected shape: ${JSON.stringify(data).slice(0, 200)}`,
        );
      }
      let record;
      try {
        record = parseEngramContentToRecord(parsed.data, now);
      } catch (err) {
        const reason = (err as Error).message;
        quarantine({ id: parsed.data.id, reason, source: "get" });
        throw new LiveEngramParseError(reason, parsed.data.id, "mem_get_observation");
      }
      return {
        id: parsed.data.id,
        topic_key: record.topic_key,
        content: record,
        fetched_at: nowIso(now),
      };
    },

    async mem_save(input: MemSaveInput): Promise<MemSaveResult> {
      log("mem_save", input);
      const sid = await ensureSession();
      const data = await http<unknown>("POST", "/observations", {
        session_id: sid,
        title: input.topic_key,
        content: JSON.stringify(input, null, 2),
        type: "manual",
        project,
        scope,
        topic_key: input.topic_key,
      });
      const parsed = RawSaveObservationSchema.safeParse(data);
      if (!parsed.success) {
        throw new LiveEngramError(
          `POST /observations returned unexpected shape: ${JSON.stringify(data).slice(0, 200)}`,
        );
      }
      return {
        id: parsed.data.id,
        topic_key: parsed.data.topic_key ?? input.topic_key,
        created_at: parsed.data.created_at ?? nowIso(now),
      };
    },

    getCallLog(): LiveEngramCall[] {
      return calls.map((call) => ({ ...call }));
    },

    resetCallLog(): void {
      calls.length = 0;
    },

    getQuarantinedRecords(): QuarantinedRecord[] {
      return quarantinedRecords.map((record) => ({ ...record }));
    },

    async healthCheck(): Promise<boolean> {
      try {
        const data = await http<unknown>("GET", "/health");
        const parsed = RawHealthSchema.safeParse(data);
        return parsed.success && parsed.data.status === "ok";
      } catch {
        return false;
      }
    },

    getSessionId(): string | undefined {
      return sessionId;
    },
  };
}
