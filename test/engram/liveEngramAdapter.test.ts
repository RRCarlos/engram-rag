import { describe, expect, it, vi } from "vitest";
import {
  LiveEngramError,
  createLiveAdapter,
  parseEngramContentToRecord,
  rawToSearchResult,
} from "../../src/engram/liveEngramAdapter.js";
import { KnowledgeRecordSchema } from "../../src/contracts/knowledgeRecord.js";

type FetchCall = { url: string; init: RequestInit | undefined };
type MockResponse = { status: number; body: unknown };

class MockFetch {
  calls: FetchCall[] = [];
  private queue: MockResponse[] = [];
  readonly fetchImpl = vi.fn(async (url, init) => {
    this.calls.push({ url: String(url), init });
    const next = this.queue.shift();
    if (!next) throw new Error(`No response queued for ${String(url)}`);
    return new Response(
      typeof next.body === "string" ? next.body : JSON.stringify(next.body),
      { status: next.status },
    );
  }) as unknown as typeof fetch;
  enqueue(response: MockResponse): void {
    this.queue.push(response);
  }
}

const fixedNow = () => new Date("2026-06-05T18:30:00.000Z");

function makeAdapter(overrides = {}) {
  const mock = new MockFetch();
  const adapter = createLiveAdapter({
    baseUrl: "http://127.0.0.1:7437",
    project: "engram-rag",
    scope: "project",
    fetchImpl: mock.fetchImpl,
    now: fixedNow,
    timeoutMs: 1000,
    ...overrides,
  });
  return { adapter, mock };
}

const markdownObservation = {
  id: 152,
  sync_id: "obs-20be4d6887b4c1cc",
  session_id: "manual-save-engram-rag",
  type: "bugfix",
  title: "Fallo simulado: Uso de && en PowerShell",
  content:
    "**What**: El agente sdd-apply intentó ejecutar `cd foo && npm install` y falló.\n" +
    "**Why**: PowerShell no soporta `&&` nativamente.\n" +
    "**Where**: shell del agente sdd-apply",
};

const jsonRecord = KnowledgeRecordSchema.parse({
  schema_version: "2.0",
  topic_key: "engram-rag/failures/sdd-apply/test",
  canonical_protocol_topic_key: "engram-rag/agent-rigor-protocol/v2",
  agent_id: "sdd-apply",
  failure_kind: "shell",
  failure_signature: "test signature",
  trigger_terms: ["test"],
  validated_solution: "test solution",
  evidence_refs: ["engram://observation/200"],
  validation_status: "draft",
  last_validated_at: "2026-06-05T00:00:00.000Z",
});

const jsonObservation = {
  id: 200,
  sync_id: "obs-22ff44",
  session_id: "manual-save-engram-rag",
  type: "manual",
  title: "JSON record",
  content: JSON.stringify(jsonRecord),
};

describe("createLiveAdapter", () => {
  it("validates required options", () => {
    expect(() => createLiveAdapter({ baseUrl: "", project: "x", scope: "project" })).toThrow(
      LiveEngramError,
    );
    expect(() =>
      createLiveAdapter({ baseUrl: "http://x", project: "", scope: "project" }),
    ).toThrow(LiveEngramError);
  });

  it("exposes preset session ids", () => {
    const { adapter } = makeAdapter({ sessionId: "preset-session" });
    expect(adapter.getSessionId()).toBe("preset-session");
  });
});

describe("LiveEngramAdapter.mem_context", () => {
  it("uses /health as the required connectivity check", async () => {
    const { adapter, mock } = makeAdapter();
    mock.enqueue({ status: 200, body: { status: "ok" } });
    mock.enqueue({ status: 200, body: [] });

    const result = await adapter.mem_context({ project: "engram-rag", scope: "project" });

    expect(mock.calls[0]?.url).toBe("http://127.0.0.1:7437/health");
    expect(result).toEqual({ observations: [], generated_at: "2026-06-05T18:30:00.000Z" });
  });

  it("throws when health fails so preflight can mark degraded=true", async () => {
    const { adapter, mock } = makeAdapter();
    mock.enqueue({ status: 500, body: "down" });
    await expect(
      adapter.mem_context({ project: "engram-rag", scope: "project" }),
    ).rejects.toThrow(LiveEngramError);
  });
});

describe("LiveEngramAdapter.mem_search", () => {
  it("calls /search with encoded params and maps markdown observations", async () => {
    const { adapter, mock } = makeAdapter();
    mock.enqueue({ status: 200, body: [markdownObservation] });

    const results = await adapter.mem_search({
      query: "powershell && cd",
      project: "engram-rag",
      scope: "project",
      limit: 5,
    });

    expect(mock.calls[0]?.url).toBe(
      "http://127.0.0.1:7437/search?q=powershell+%26%26+cd&project=engram-rag&scope=project&limit=5",
    );
    expect(results[0]).toMatchObject({ id: 152, agent_id: "sdd-apply", score: 1 });
    expect(results[0]?.trigger_terms).toContain("powershell");
  });

  it("maps JSON observations and empty search responses", async () => {
    const { adapter, mock } = makeAdapter();
    mock.enqueue({ status: 200, body: [jsonObservation] });
    mock.enqueue({ status: 200, body: [] });

    const results = await adapter.mem_search({
      query: "test",
      project: "engram-rag",
      scope: "project",
      limit: 5,
    });
    const empty = await adapter.mem_search({
      query: "none",
      project: "engram-rag",
      scope: "project",
      limit: 5,
    });

    expect(results[0]).toMatchObject({ failure_signature: "test signature" });
    expect(empty).toEqual([]);
  });

  it("quarantines legacy-alias search observations without dropping valid hits", async () => {
    const { adapter, mock } = makeAdapter();
    const forbiddenAlias = ["protocol", "rigor", "v1"].join("/");
    mock.enqueue({
      status: 200,
      body: [
        { ...markdownObservation, id: 999, topic_key: `${forbiddenAlias}/legacy-hit` },
        markdownObservation,
      ],
    });

    const results = await adapter.mem_search({
      query: "powershell && memoria #152",
      project: "engram-rag",
      scope: "project",
      limit: 5,
    });

    expect(results.map((result) => result.id)).toEqual([152]);
    expect(adapter.getQuarantinedRecords()).toEqual([
      { id: 999, reason: expect.stringContaining("Forbidden v1"), source: "search" },
    ]);
  });

  it("throws on unexpected server shape", async () => {
    const { adapter, mock } = makeAdapter();
    mock.enqueue({ status: 200, body: { not: "array" } });
    await expect(
      adapter.mem_search({ query: "x", project: "engram-rag", scope: "project", limit: 5 }),
    ).rejects.toThrow(LiveEngramError);
  });
});

describe("LiveEngramAdapter.mem_get_observation", () => {
  it("fetches /observations/{id} and returns a strict KnowledgeRecord", async () => {
    const { adapter, mock } = makeAdapter();
    mock.enqueue({ status: 200, body: markdownObservation });

    const observation = await adapter.mem_get_observation({ id: 152 });

    expect(mock.calls[0]?.url).toBe("http://127.0.0.1:7437/observations/152");
    expect(observation.id).toBe(152);
    expect(observation.fetched_at).toBe("2026-06-05T18:30:00.000Z");
    expect(() => KnowledgeRecordSchema.parse(observation.content)).not.toThrow();
  });
});

describe("LiveEngramAdapter.mem_save", () => {
  it("lazily creates a session and POSTs the record body", async () => {
    const { adapter, mock } = makeAdapter();
    mock.enqueue({ status: 200, body: { session_id: "auto-session" } });
    mock.enqueue({ status: 200, body: { id: 300, topic_key: jsonRecord.topic_key } });

    const result = await adapter.mem_save(jsonRecord);

    expect(result).toMatchObject({ id: 300, topic_key: jsonRecord.topic_key });
    expect(adapter.getSessionId()).toBe("auto-session");
    expect(mock.calls[0]?.url).toBe("http://127.0.0.1:7437/sessions");
    expect(JSON.parse(String(mock.calls[0]?.init?.body))).toEqual({
      project: "engram-rag",
      scope: "project",
    });
    const observationBody = JSON.parse(String(mock.calls[1]?.init?.body));
    expect(observationBody).toMatchObject({
      session_id: "auto-session",
      title: jsonRecord.topic_key,
      type: "manual",
      project: "engram-rag",
      scope: "project",
      topic_key: jsonRecord.topic_key,
    });
    expect(JSON.parse(observationBody.content)).toEqual(jsonRecord);
  });

  it("reuses an existing session id", async () => {
    const { adapter, mock } = makeAdapter({ sessionId: "preset" });
    mock.enqueue({ status: 200, body: { id: 301, topic_key: jsonRecord.topic_key } });

    await adapter.mem_save(jsonRecord);

    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0]?.url).toBe("http://127.0.0.1:7437/observations");
  });
});

describe("LiveEngramAdapter helpers", () => {
  it("healthCheck returns true only for status ok", async () => {
    const { adapter, mock } = makeAdapter();
    mock.enqueue({ status: 200, body: { status: "ok" } });
    mock.enqueue({ status: 503, body: "down" });

    await expect(adapter.healthCheck()).resolves.toBe(true);
    await expect(adapter.healthCheck()).resolves.toBe(false);
  });

  it("records and clears adapter calls", async () => {
    const { adapter, mock } = makeAdapter();
    mock.enqueue({ status: 200, body: { status: "ok" } });
    mock.enqueue({ status: 200, body: [] });

    await adapter.mem_context({ project: "engram-rag", scope: "project" });

    expect(adapter.getCallLog()).toHaveLength(1);
    adapter.resetCallLog();
    expect(adapter.getCallLog()).toEqual([]);
  });

  it("maps raw content and rejects forbidden aliases", () => {
    const record = parseEngramContentToRecord(markdownObservation, fixedNow);
    const forbiddenAlias = ["protocol", "rigor", "v1"].join("/");

    expect(record).toMatchObject({ agent_id: "sdd-apply", failure_kind: "shell" });
    expect(record.trigger_terms).toContain("powershell");
    expect(() =>
      parseEngramContentToRecord(
        { ...markdownObservation, topic_key: `${forbiddenAlias}/should-not-leak` },
        fixedNow,
      ),
    ).toThrow(/Forbidden v1/);
  });

  it("assigns positive rank-based search scores", () => {
    const first = rawToSearchResult(markdownObservation, "powershell", 0, fixedNow);
    const later = rawToSearchResult(markdownObservation, "powershell", 5, fixedNow);

    expect(first.score).toBeGreaterThan(later.score);
    expect(first.score).toBeLessThanOrEqual(1);
  });
});
