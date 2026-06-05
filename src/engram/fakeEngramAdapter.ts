import type { KnowledgeRecord } from "../contracts/knowledgeRecord.js";
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
} from "./EngramTools.js";

export const FAKE_ENGRAM_METHODS = [
  "mem_context",
  "mem_search",
  "mem_get_observation",
  "mem_save",
] as const;

export type FakeEngramMethod = (typeof FAKE_ENGRAM_METHODS)[number];
export type FakeEngramFailureMode = "none" | "throw" | "timeout";

export interface FakeEngramCall {
  method: FakeEngramMethod;
  input: unknown;
  at: string;
}

export interface FakeEngramOptions {
  failureMode?: FakeEngramFailureMode;
  failOn?: FakeEngramMethod[];
  latencyMs?: number;
  timeoutMs?: number;
  now?: () => Date;
}

export interface FakeEngramAdapter extends EngramTools {
  getCallLog(): FakeEngramCall[];
  resetCallLog(): void;
}

export class FakeEngramError extends Error {
  constructor(
    message: string,
    readonly method: FakeEngramMethod,
  ) {
    super(message);
    this.name = "FakeEngramError";
  }
}

export class FakeEngramTimeoutError extends FakeEngramError {
  constructor(method: FakeEngramMethod, timeoutMs: number) {
    super(`Fake Engram timeout in ${method} after ${timeoutMs}ms`, method);
    this.name = "FakeEngramTimeoutError";
  }
}

interface StoredRecord {
  id: number;
  record: KnowledgeRecord;
}

const DEFAULT_LATENCY_MS = 0;
const DEFAULT_TIMEOUT_MS = 10;

function iso(now: () => Date): string {
  return now().toISOString();
}

function normalize(input: string): string {
  return input.toLowerCase();
}

function queryTerms(query: string): string[] {
  return normalize(query)
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);
}

function searchableText(record: KnowledgeRecord): string {
  return normalize(
    [
      record.topic_key,
      record.agent_id,
      record.failure_kind,
      record.failure_signature,
      record.validated_solution,
      ...record.trigger_terms,
    ].join(" "),
  );
}

function scoreRecord(record: KnowledgeRecord, terms: string[]): number {
  const haystack = searchableText(record);
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}

function summary(record: KnowledgeRecord): string {
  return `${record.agent_id}: ${record.failure_signature}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createFakeAdapter(
  records: KnowledgeRecord[],
  options: FakeEngramOptions = {},
): FakeEngramAdapter {
  const now = options.now ?? (() => new Date());
  const latencyMs = options.latencyMs ?? DEFAULT_LATENCY_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const failureMode = options.failureMode ?? "none";
  const failOn = new Set<FakeEngramMethod>(options.failOn ?? [...FAKE_ENGRAM_METHODS]);

  const stored: StoredRecord[] = records.map((record, index) => ({
    id: index + 1,
    record: KnowledgeRecordSchema.parse(record),
  }));
  const calls: FakeEngramCall[] = [];

  async function before(method: FakeEngramMethod, input: unknown): Promise<void> {
    calls.push({ method, input, at: iso(now) });
    if (latencyMs > 0) {
      await delay(latencyMs);
    }
    if (!failOn.has(method) || failureMode === "none") {
      return;
    }
    if (failureMode === "throw") {
      throw new FakeEngramError(`Fake Engram failure in ${method}`, method);
    }
    await delay(timeoutMs + 1);
    throw new FakeEngramTimeoutError(method, timeoutMs);
  }

  return {
    async mem_context(input: MemContextInput): Promise<MemContextResult> {
      await before("mem_context", input);
      return {
        observations: stored.map(({ id, record }) => ({
          id,
          topic_key: record.topic_key,
          summary: summary(record),
        })),
        generated_at: iso(now),
      };
    },

    async mem_search(input: MemSearchInput): Promise<MemSearchResult[]> {
      await before("mem_search", input);
      const terms = queryTerms(input.query);
      return stored
        .map(({ id, record }) => ({ id, record, score: scoreRecord(record, terms) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score || a.id - b.id)
        .slice(0, input.limit)
        .map(({ id, record, score }) => ({
          id,
          topic_key: record.topic_key,
          agent_id: record.agent_id,
          failure_signature: record.failure_signature,
          trigger_terms: record.trigger_terms,
          score,
        }));
    },

    async mem_get_observation(input: MemGetObservationInput): Promise<MemObservation> {
      await before("mem_get_observation", input);
      const found = stored.find((entry) => entry.id === input.id);
      if (!found) {
        throw new FakeEngramError(`Observation ${input.id} not found`, "mem_get_observation");
      }
      return {
        id: found.id,
        topic_key: found.record.topic_key,
        content: found.record,
        fetched_at: iso(now),
      };
    },

    async mem_save(input: MemSaveInput): Promise<MemSaveResult> {
      await before("mem_save", input);
      const record = KnowledgeRecordSchema.parse(input);
      const id = stored.length + 1;
      stored.push({ id, record });
      return { id, topic_key: record.topic_key, created_at: iso(now) };
    },

    getCallLog(): FakeEngramCall[] {
      return calls.map((call) => ({ ...call }));
    },

    resetCallLog(): void {
      calls.length = 0;
    },
  };
}
