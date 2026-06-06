import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseKnowledgeRecord, type KnowledgeRecord } from "../../src/contracts/knowledgeRecord.js";
import {
  createFakeAdapter,
  FakeEngramError,
  FakeEngramTimeoutError,
} from "../../src/engram/fakeEngramAdapter.js";

function fixture(path: string): KnowledgeRecord {
  const url = new URL(`../../fixtures/knowledge/${path}`, import.meta.url);
  return parseKnowledgeRecord(JSON.parse(readFileSync(url, "utf8")));
}

function records(): KnowledgeRecord[] {
  return [fixture("powershell-and.json"), fixture("sdd-spec-gherkin.json")];
}

const fixedNow = () => new Date("2026-06-05T16:00:00.000Z");

describe("createFakeAdapter", () => {
  it("returns context observations and records a deterministic call log", async () => {
    const adapter = createFakeAdapter(records(), { now: fixedNow });

    const result = await adapter.mem_context({ project: "engram-rag", scope: "project" });

    expect(result.generated_at).toBe("2026-06-05T16:00:00.000Z");
    expect(result.observations).toHaveLength(2);
    expect(result.observations[0]).toMatchObject({
      id: 1,
      topic_key: "engram-rag/failures/sdd-apply/powershell-and",
    });
    expect(adapter.getCallLog()).toEqual([
      {
        method: "mem_context",
        input: { project: "engram-rag", scope: "project" },
        at: "2026-06-05T16:00:00.000Z",
      },
    ]);
  });

  it("ranks mem_search matches by term coverage and keeps stable id ordering", async () => {
    const adapter = createFakeAdapter(records());

    const powershell = await adapter.mem_search({
      query: "powershell && shell-chain",
      project: "engram-rag",
      scope: "project",
      limit: 5,
    });
    const gherkin = await adapter.mem_search({
      query: "gherkin given when then scenario",
      project: "engram-rag",
      scope: "project",
      limit: 5,
    });

    expect(powershell[0]?.topic_key).toBe("engram-rag/failures/sdd-apply/powershell-and");
    expect(powershell[0]?.score).toBeGreaterThan(1);
    expect(gherkin[0]?.topic_key).toBe("engram-rag/failures/sdd-spec/gherkin-missing");
  });

  it("respects the mem_search limit", async () => {
    const adapter = createFakeAdapter(records());

    const result = await adapter.mem_search({
      query: "sdd",
      project: "engram-rag",
      scope: "project",
      limit: 1,
    });

    expect(result).toHaveLength(1);
  });

  it("fetches full observations by id and rejects unknown ids", async () => {
    const adapter = createFakeAdapter(records(), { now: fixedNow });

    const found = await adapter.mem_get_observation({ id: 1 });

    expect(found.fetched_at).toBe("2026-06-05T16:00:00.000Z");
    expect(found.content.validated_solution).toContain("PowerShell does NOT support");
    await expect(adapter.mem_get_observation({ id: 999 })).rejects.toThrow(FakeEngramError);
  });

  it("saves validated records with monotonic ids", async () => {
    const [first] = records();
    if (first === undefined) {
      throw new Error("test fixture must contain at least one knowledge record");
    }
    const record = first;
    const adapter = createFakeAdapter([], { now: fixedNow });

    const saved = await adapter.mem_save(record);
    const fetched = await adapter.mem_get_observation({ id: saved.id });

    expect(saved).toEqual({
      id: 1,
      topic_key: record.topic_key,
      created_at: "2026-06-05T16:00:00.000Z",
    });
    expect(fetched.content.topic_key).toBe(record.topic_key);
  });

  it("can reset the call log", async () => {
    const adapter = createFakeAdapter(records());

    await adapter.mem_context({ project: "engram-rag", scope: "project" });
    adapter.resetCallLog();

    expect(adapter.getCallLog()).toEqual([]);
  });

  it("rejects configured throw failures for selected methods", async () => {
    const adapter = createFakeAdapter(records(), {
      failureMode: "throw",
      failOn: ["mem_search"],
    });

    await expect(
      adapter.mem_search({
        query: "powershell",
        project: "engram-rag",
        scope: "project",
        limit: 5,
      }),
    ).rejects.toThrow(FakeEngramError);
    await expect(adapter.mem_context({ project: "engram-rag", scope: "project" })).resolves.toBeTruthy();
  });

  it("simulates configured timeouts after the timeout budget", async () => {
    const adapter = createFakeAdapter(records(), {
      failureMode: "timeout",
      failOn: ["mem_search"],
      timeoutMs: 5,
    });
    const started = performance.now();

    await expect(
      adapter.mem_search({
        query: "powershell",
        project: "engram-rag",
        scope: "project",
        limit: 5,
      }),
    ).rejects.toThrow(FakeEngramTimeoutError);

    expect(performance.now() - started).toBeGreaterThanOrEqual(5);
  });
});
