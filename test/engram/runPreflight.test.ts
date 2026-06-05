import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseKnowledgeRecord, type KnowledgeRecord } from "../../src/contracts/knowledgeRecord.js";
import type { RetrievalRequest } from "../../src/contracts/retrieval.js";
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

    await expect(runPreflight(powershellRequest, adapter)).resolves.toMatchObject({
      degraded: true,
      records: [],
      applied_rules: [],
      missing_expected_records: ["powershell"],
    });
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
});
