import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseKnowledgeRecord, type KnowledgeRecord } from "../../src/contracts/knowledgeRecord.js";
import type { RetrievalRequest } from "../../src/contracts/retrieval.js";
import type { EngramTools, MemSearchResult } from "../../src/engram/EngramTools.js";
import { createFakeAdapter } from "../../src/engram/fakeEngramAdapter.js";
import { runPreflight } from "../../src/engram/runPreflight.js";

function fixture(path: string): KnowledgeRecord {
  const url = new URL(`../../fixtures/knowledge/${path}`, import.meta.url);
  return parseKnowledgeRecord(JSON.parse(readFileSync(url, "utf8")));
}

const powershellRequest: RetrievalRequest = {
  project: "engram-rag",
  agent_id: "sdd-apply",
  task_text: "Run npm install in PowerShell without repeating the && bug",
  action_kind: "shell",
  shell: "powershell",
};

function poisonedAdapter(): EngramTools & {
  getQuarantinedRecords: () => Array<{ id: number; reason: string; source: "search" | "get" }>;
} {
  const valid = fixture("powershell-and.json");
  const searchResults: MemSearchResult[] = [
    {
      id: 999,
      topic_key: "legacy-alias-hit",
      agent_id: "sdd-apply",
      failure_signature: "legacy alias should be quarantined",
      trigger_terms: ["powershell"],
      score: 2,
    },
    {
      id: 152,
      topic_key: valid.topic_key,
      agent_id: valid.agent_id,
      failure_signature: valid.failure_signature,
      trigger_terms: valid.trigger_terms,
      score: 1,
    },
  ];
  const quarantined = [{ id: 999, reason: "Forbidden v1 topic alias", source: "search" as const }];
  return {
    async mem_context() {
      return { observations: [], generated_at: "2026-06-05T18:30:00.000Z" };
    },
    async mem_search() {
      return searchResults;
    },
    async mem_get_observation(input) {
      if (input.id === 999) {
        const error = new Error("Forbidden v1 topic alias") as Error & { observationId: number };
        error.observationId = 999;
        throw error;
      }
      return {
        id: 152,
        topic_key: valid.topic_key,
        content: valid,
        fetched_at: "2026-06-05T18:30:00.000Z",
      };
    },
    async mem_save(input) {
      return { id: 1, topic_key: input.topic_key, created_at: "2026-06-05T18:30:00.000Z" };
    },
    getQuarantinedRecords() {
      return quarantined;
    },
  };
}

describe("runPreflight", () => {
  it("calls mem_context before mem_search", async () => {
    const adapter = createFakeAdapter([fixture("powershell-and.json")]);

    await runPreflight(powershellRequest, adapter);

    const methods = adapter.getCallLog().map((call) => call.method);
    expect(methods[0]).toBe("mem_context");
    expect(methods.indexOf("mem_context")).toBeLessThan(methods.indexOf("mem_search"));
  });

  it("fetches every used search result with mem_get_observation", async () => {
    const adapter = createFakeAdapter([fixture("powershell-and.json")]);

    const result = await runPreflight(powershellRequest, adapter);

    const getObservationIds = adapter
      .getCallLog()
      .filter((call) => call.method === "mem_get_observation")
      .map((call) => (call.input as { id: number }).id);

    expect(result.records).toHaveLength(1);
    expect(getObservationIds).toEqual([1]);
  });

  it("recovers the validated PowerShell solution and marks it as applied", async () => {
    const adapter = createFakeAdapter([fixture("powershell-and.json")]);

    const result = await runPreflight(powershellRequest, adapter);

    expect(result.degraded).toBe(false);
    expect(result.records[0]?.validated_solution).toContain("cmd1; if ($?) { cmd2 }");
    expect(result.applied_rules).toContain("Used `&&` to chain commands inside a PowerShell bash tool call.");
    expect(result.missing_expected_records).toEqual([]);
  });

  it("consults #152 and stays non-degraded when legacy hits are quarantined", async () => {
    const result = await runPreflight(powershellRequest, poisonedAdapter());

    expect(result.degraded).toBe(false);
    expect(result.consulted_ids).toEqual([152]);
    expect(result.quarantined_records).toEqual([
      { id: 999, reason: "Forbidden v1 topic alias", source: "search" },
    ]);
    expect(result.applied_rules).toContain("Used `&&` to chain commands inside a PowerShell bash tool call.");
    expect(result.correction_candidates).toContain("cmd1; if ($?) { cmd2 }");
    expect(result.missing_expected_records).toEqual([]);
  });

  it("reports positive latency under the local budget", async () => {
    const adapter = createFakeAdapter([fixture("powershell-and.json")], { latencyMs: 1 });

    const result = await runPreflight(powershellRequest, adapter);

    expect(result.latency_ms).toBeGreaterThan(0);
    expect(result.latency_ms).toBeLessThanOrEqual(2000);
  });

  it("returns degraded true when mem_search fails without throwing", async () => {
    const adapter = createFakeAdapter([fixture("powershell-and.json")], {
      failureMode: "throw",
      failOn: ["mem_search"],
    });

    const result = await runPreflight(powershellRequest, adapter);
    expect(result.degraded).toBe(true);
    expect(result.records).toEqual([]);
    expect(result.applied_rules).toEqual([]);
    expect(result.missing_expected_records).toEqual(["powershell"]);
    expect(result.enforcement.outcome).toBe("blocked");
    expect(result.enforcement.reason).toContain("degraded");
  });

  it("returns degraded true when mem_get_observation fails without throwing", async () => {
    const adapter = createFakeAdapter([
      fixture("powershell-and.json"),
      fixture("sdd-spec-gherkin.json"),
    ], {
      failureMode: "throw",
      failOn: ["mem_get_observation"],
    });

    const result = await runPreflight(
      {
        project: "engram-rag",
        agent_id: "sdd-spec",
        task_text: "Write a Gherkin scenario for PowerShell behavior",
        action_kind: "spec",
        shell: "powershell",
      },
      adapter,
    );

    expect(result.degraded).toBe(true);
    expect(result.records).toEqual([]);
    expect(result.applied_rules).toEqual([]);
    expect(result.missing_expected_records).toEqual(["powershell", "gherkin"]);
  });

  it("attaches a typed enforcement decision alongside the consult result", async () => {
    const result = await runPreflight(powershellRequest, createFakeAdapter([fixture("powershell-and.json")]));

    expect(result.enforcement.outcome).toBe("correct");
    expect(result.enforcement.corrected_command).toBe("cmd1; if ($?) { cmd2 }");
    expect(result.enforcement.consulted_ids).toEqual(result.consulted_ids);
    expect(result.enforcement.missing_expected_records).toEqual([]);
    expect(result.enforcement.trace_id).toMatch(/^trc-[0-9a-f]{16}$/);
  });
});
