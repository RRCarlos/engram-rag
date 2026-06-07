import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  KnowledgeRecordSchema,
  type KnowledgeRecord,
} from "../../src/contracts/knowledgeRecord.js";
import { CANONICAL_PROTOCOL_TOPIC_KEY } from "../../src/contracts/topicKeys.js";
import type { RetrievalRequest } from "../../src/contracts/retrieval.js";
import { createFakeAdapter } from "../../src/engram/fakeEngramAdapter.js";
import type { EngramTools, MemSaveInput } from "../../src/engram/EngramTools.js";
import { runPreflight } from "../../src/engram/runPreflight.js";
import {
  dispatchOperationalTool,
  handleErrorLearn,
  handleErrorPreflight,
  handleErrorStats,
  listOperationalTools,
  OPERATIONAL_TOOL_NAMES,
  type ToolCallResult,
} from "../../src/mcp/operationalTools.js";
import { createOperationalMetricsState } from "../../src/mcp/operationalMetrics.js";

/**
 * Handler-level tests for the operational MCP tools. The handlers are
 * pure functions over the underlying Engram adapter; we exercise them
 * with the fake adapter (CI-safe) and confirm they project the same
 * shape the live CLI uses so MCP callers cannot drift from CLI
 * behavior. PR3 / #29.
 */

function fixture(path: string): KnowledgeRecord {
  const url = new URL(`../../fixtures/knowledge/${path}`, import.meta.url);
  return parseKnowledgeRecord(JSON.parse(readFileSync(url, "utf8")));
}

function parseKnowledgeRecord(input: unknown): KnowledgeRecord {
  return KnowledgeRecordSchema.parse(input);
}

function buildLearnInput(overrides: Partial<KnowledgeRecord> = {}): MemSaveInput {
  return parseKnowledgeRecord({
    schema_version: "2.0",
    topic_key: "engram-rag/failures/sdd-apply/operational-learn",
    canonical_protocol_topic_key: CANONICAL_PROTOCOL_TOPIC_KEY,
    agent_id: "sdd-apply",
    failure_kind: "shell",
    failure_signature: "operational learn signature",
    trigger_terms: ["operational", "mcp", "learn"],
    validated_solution: "Recorded by error_learn tool.",
    evidence_refs: ["engram://observation/test"],
    validation_status: "validated",
    last_validated_at: "2026-06-07T10:00:00.000Z",
    ...overrides,
  });
}

const powershellAndRequest: RetrievalRequest = {
  project: "engram-rag",
  agent_id: "sdd-apply",
  task_text: "Run `cd foo && npm install` in PowerShell.",
  action_kind: "shell",
  shell: "powershell",
};

const cleanReadRequest: RetrievalRequest = {
  project: "engram-rag",
  agent_id: "sdd-apply",
  task_text: "Read the PR1 verify report.",
  action_kind: "read",
};

function parseText(result: ToolCallResult): { text: string; isError: boolean | undefined } {
  return {
    text: result.content[0]?.text ?? "",
    isError: result.isError,
  };
}

function parseJson<T>(result: ToolCallResult): T {
  return JSON.parse(parseText(result).text) as T;
}

describe("operational tools — tool list and names", () => {
  it("exposes exactly the three documented tool names", () => {
    expect(new Set(OPERATIONAL_TOOL_NAMES)).toEqual(
      new Set(["error_preflight", "error_learn", "error_stats"]),
    );
  });

  it("listOperationalTools returns a descriptor for every name", () => {
    const list = listOperationalTools();
    const names = list.map((tool) => tool.name);
    expect(names).toEqual(["error_preflight", "error_learn", "error_stats"]);
    for (const tool of list) {
      expect(typeof tool.description).toBe("string");
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.inputSchema).toBeTruthy();
    }
  });

  it("error_preflight descriptor requires the four mandatory fields", () => {
    const list = listOperationalTools();
    const preflight = list.find((t) => t.name === "error_preflight");
    const required = (preflight?.inputSchema as { required?: string[] }).required ?? [];
    expect(required).toEqual(
      expect.arrayContaining(["project", "agent_id", "task_text", "action_kind"]),
    );
  });

  it("error_learn descriptor requires the KnowledgeRecord fields", () => {
    const list = listOperationalTools();
    const learn = list.find((t) => t.name === "error_learn");
    const required = (learn?.inputSchema as { required?: string[] }).required ?? [];
    for (const field of [
      "schema_version",
      "topic_key",
      "canonical_protocol_topic_key",
      "agent_id",
      "failure_kind",
      "failure_signature",
      "trigger_terms",
      "validated_solution",
      "evidence_refs",
      "validation_status",
      "last_validated_at",
    ]) {
      expect(required).toContain(field);
    }
  });

  it("error_stats descriptor accepts an empty payload", () => {
    const list = listOperationalTools();
    const stats = list.find((t) => t.name === "error_stats");
    expect(stats?.inputSchema).toBeTruthy();
  });
});

describe("operational tools — error_preflight", () => {
  it("returns the full PreflightResult for a valid PowerShell && request", async () => {
    const tools = createFakeAdapter([fixture("powershell-and.json")]);
    const state = createOperationalMetricsState();
    const result = await handleErrorPreflight(tools, state, powershellAndRequest);
    expect(result.isError).toBeUndefined();
    const body = parseJson<{
      enforcement: { outcome: string; corrected_command?: string; trace_id: string };
      consulted_ids: number[];
      correction_candidates: string[];
      degraded: boolean;
    }>(result);
    expect(body.enforcement.outcome).toBe("correct");
    expect(body.enforcement.corrected_command).toBe("cmd1; if ($?) { cmd2 }");
    expect(body.correction_candidates).toContain("cmd1; if ($?) { cmd2 }");
    expect(body.degraded).toBe(false);
    expect(body.consulted_ids.length).toBeGreaterThan(0);
    expect(body.enforcement.trace_id).toMatch(/^trc-[0-9a-f]{16}$/);
  });

  it("returns outcome allow for a clean read action", async () => {
    const tools = createFakeAdapter([fixture("powershell-and.json")]);
    const state = createOperationalMetricsState();
    const result = await handleErrorPreflight(tools, state, cleanReadRequest);
    const body = parseJson<{
      enforcement: { outcome: string; corrected_command?: string };
    }>(result);
    expect(body.enforcement.outcome).toBe("allow");
    expect(body.enforcement.corrected_command).toBeUndefined();
  });

  it("returns outcome blocked and marks degraded when mem_search fails", async () => {
    const tools = createFakeAdapter([fixture("powershell-and.json")], {
      failureMode: "throw",
      failOn: ["mem_search"],
    });
    const state = createOperationalMetricsState();
    const result = await handleErrorPreflight(tools, state, powershellAndRequest);
    const body = parseJson<{
      degraded: boolean;
      enforcement: { outcome: string; reason: string };
      missing_expected_records: string[];
    }>(result);
    expect(body.degraded).toBe(true);
    expect(body.enforcement.outcome).toBe("blocked");
    expect(body.enforcement.reason).toContain("degraded");
    expect(body.missing_expected_records).toContain("powershell");
  });

  it("returns isError on invalid input", async () => {
    const tools = createFakeAdapter([fixture("powershell-and.json")]);
    const state = createOperationalMetricsState();
    const result = await handleErrorPreflight(tools, state, { project: "" });
    expect(result.isError).toBe(true);
    const { text } = parseText(result);
    expect(text).toMatch(/Invalid input/i);
  });

  it("degrades the preflight when mem_get_observation fails on a high-risk action", async () => {
    // When `mem_get_observation` throws WITHOUT an `observationId`
    // marker (the fake adapter's behavior), `runPreflight` marks the
    // run as degraded and the enforcement layer blocks the high-risk
    // action. The handler surfaces the degraded result instead of
    // throwing.
    const tools = createFakeAdapter([fixture("powershell-and.json")], {
      failureMode: "throw",
      failOn: ["mem_get_observation"],
    });
    const state = createOperationalMetricsState();
    const result = await handleErrorPreflight(tools, state, powershellAndRequest);
    expect(result.isError).toBeUndefined();
    const body = parseJson<{
      degraded: boolean;
      enforcement: { outcome: string; reason: string };
    }>(result);
    expect(body.degraded).toBe(true);
    expect(body.enforcement.outcome).toBe("blocked");
  });

  it("produces the same enforcement shape as runPreflight directly", async () => {
    const tools = createFakeAdapter([fixture("powershell-and.json")]);
    const state = createOperationalMetricsState();
    const handlerResult = await handleErrorPreflight(tools, state, powershellAndRequest);
    const handlerBody = parseJson<{
      enforcement: Record<string, unknown>;
    }>(handlerResult);
    // The handler returns the full PreflightResult, so the
    // enforcement block must match the one produced by the runner.
    const direct = await runPreflight(powershellAndRequest, createFakeAdapter([fixture("powershell-and.json")]));
    expect(handlerBody.enforcement).toEqual(direct.enforcement);
  });
});

describe("operational tools — error_learn", () => {
  it("returns a save result for a valid KnowledgeRecord and updates counters", async () => {
    const tools = createFakeAdapter([]);
    const state = createOperationalMetricsState();
    const result = await handleErrorLearn(tools, state, buildLearnInput());
    expect(result.isError).toBeUndefined();
    const body = parseJson<{
      id: number;
      topic_key: string;
      created_at: string;
    }>(result);
    expect(body.id).toBeGreaterThan(0);
    expect(body.topic_key).toContain("operational-learn");
    const stats = parseJson<{ total_learns: number; repeat_error_rate: number }>(
      handleErrorStats(state),
    );
    expect(stats.total_learns).toBe(1);
    expect(stats.repeat_error_rate).toBe(0);
  });

  it("returns isError on invalid input", async () => {
    const tools = createFakeAdapter([]);
    const state = createOperationalMetricsState();
    const result = await handleErrorLearn(tools, state, { topic_key: "x" });
    expect(result.isError).toBe(true);
    const { text } = parseText(result);
    expect(text).toMatch(/Invalid input/i);
  });

  it("returns isError when the adapter throws on mem_save", async () => {
    const tools = createFakeAdapter([], { failureMode: "throw", failOn: ["mem_save"] });
    const state = createOperationalMetricsState();
    const result = await handleErrorLearn(tools, state, buildLearnInput());
    expect(result.isError).toBe(true);
  });

  it("counts repeated failure signatures toward repeat_error_rate", async () => {
    const tools = createFakeAdapter([]);
    const state = createOperationalMetricsState();
    await handleErrorLearn(tools, state, buildLearnInput());
    await handleErrorLearn(tools, state, buildLearnInput()); // same signature = repeat
    await handleErrorLearn(
      tools,
      state,
      buildLearnInput({ failure_signature: "different signature" }),
    );
    const stats = parseJson<{ total_learns: number; repeat_error_rate: number }>(
      handleErrorStats(state),
    );
    expect(stats.total_learns).toBe(3);
    expect(stats.repeat_error_rate).toBeCloseTo(1 / 3, 5);
  });
});

describe("operational tools — error_stats", () => {
  it("returns zero state when no activity has been recorded", () => {
    const state = createOperationalMetricsState();
    const stats = parseJson<{
      preflight_coverage: number;
      retrieval_hit_rate: number;
      application_rate: number;
      repeat_error_rate: number;
      prevention_rate: number;
      total_consults: number;
      total_learns: number;
    }>(handleErrorStats(state));
    expect(stats.preflight_coverage).toBe(0);
    expect(stats.retrieval_hit_rate).toBe(0);
    expect(stats.application_rate).toBe(0);
    expect(stats.repeat_error_rate).toBe(0);
    expect(stats.prevention_rate).toBe(0);
    expect(stats.total_consults).toBe(0);
    expect(stats.total_learns).toBe(0);
  });

  it("reflects consult and learn activity across all five metrics", async () => {
    const tools = createFakeAdapter([fixture("powershell-and.json")]);
    const state = createOperationalMetricsState();
    // 1 PowerShell && consult (correct outcome, 1 hit, applied rule)
    await handleErrorPreflight(tools, state, powershellAndRequest);
    // 1 clean read consult (allow outcome, 1 hit, applied rule)
    await handleErrorPreflight(tools, state, cleanReadRequest);
    // 1 learn (new signature)
    await handleErrorLearn(tools, state, buildLearnInput());
    const stats = parseJson<{
      preflight_coverage: number;
      retrieval_hit_rate: number;
      application_rate: number;
      repeat_error_rate: number;
      prevention_rate: number;
      total_consults: number;
      total_learns: number;
    }>(handleErrorStats(state));
    expect(stats.total_consults).toBe(2);
    expect(stats.total_learns).toBe(1);
    expect(stats.preflight_coverage).toBe(1); // 0 degraded of 2
    expect(stats.retrieval_hit_rate).toBe(1); // 2 with hits of 2
    expect(stats.application_rate).toBe(1); // both apply a rule
    expect(stats.prevention_rate).toBe(0.5); // 1 of 2 was correct
    expect(stats.repeat_error_rate).toBe(0); // first learn is unique
  });

  it("treats a degraded preflight as a non-coverage consult", async () => {
    const tools = createFakeAdapter([fixture("powershell-and.json")], {
      failureMode: "throw",
      failOn: ["mem_search"],
    });
    const state = createOperationalMetricsState();
    await handleErrorPreflight(tools, state, cleanReadRequest);
    const stats = parseJson<{ preflight_coverage: number; prevention_rate: number }>(
      handleErrorStats(state),
    );
    expect(stats.preflight_coverage).toBe(0);
    // read is a safe action so enforcement is `allow` even when
    // preflight is degraded (matches PR2 behavior).
    expect(stats.prevention_rate).toBe(0);
  });
});

describe("operational tools — dispatchOperationalTool", () => {
  it("routes error_preflight through the preflight handler", async () => {
    const tools = createFakeAdapter([fixture("powershell-and.json")]);
    const state = createOperationalMetricsState();
    const result = await dispatchOperationalTool(
      "error_preflight",
      tools,
      state,
      powershellAndRequest,
    );
    const body = parseJson<{ enforcement: { outcome: string } }>(result);
    expect(body.enforcement.outcome).toBe("correct");
  });

  it("routes error_learn through the learn handler", async () => {
    const tools = createFakeAdapter([]);
    const state = createOperationalMetricsState();
    const result = await dispatchOperationalTool(
      "error_learn",
      tools,
      state,
      buildLearnInput(),
    );
    const body = parseJson<{ id: number }>(result);
    expect(body.id).toBeGreaterThan(0);
  });

  it("routes error_stats through the stats handler", async () => {
    const state = createOperationalMetricsState();
    const result = await dispatchOperationalTool(
      "error_stats",
      {} as EngramTools,
      state,
      undefined,
    );
    const body = parseJson<{ total_consults: number }>(result);
    expect(body.total_consults).toBe(0);
  });

  it("returns isError for an unknown tool name", async () => {
    const state = createOperationalMetricsState();
    const result = await dispatchOperationalTool(
      "error_unexpected",
      {} as EngramTools,
      state,
      {},
    );
    expect(result.isError).toBe(true);
    const { text } = parseText(result);
    expect(text).toContain("Unknown operational tool");
  });
});

describe("operational tools — adapter independence", () => {
  it("does not call any document-RAG tool (rag_*) when running error_* tools", async () => {
    // We use a real fake adapter and assert that the only methods
    // ever called are the Engram memory methods — never a hypothetical
    // rag_* surface. This guards against accidentally wiring the
    // operational layer to the document RAG engine.
    const tools = createFakeAdapter([fixture("powershell-and.json")]);
    const state = createOperationalMetricsState();
    await handleErrorPreflight(tools, state, powershellAndRequest);
    await handleErrorLearn(tools, state, buildLearnInput());
    const methods = tools.getCallLog().map((call) => call.method);
    for (const method of methods) {
      expect(method).toMatch(/^mem_/);
    }
  });
});

describe("operational tools — learn → consult loop (PR3 suggestion / PR4 closure)", () => {
  it("makes a record saved via error_learn queryable by a follow-up error_preflight", async () => {
    // The PR3 verify report flagged a "soft gap": no explicit
    // learn → consult sequenced test. The architecture supports
    // the loop (the fake adapter's `stored` array is shared
    // between mem_save and mem_search/mem_get_observation), but
    // the test is what protects it from a future refactor.
    const tools = createFakeAdapter([]);
    const state = createOperationalMetricsState();

    // Step 1 — learn a new PowerShell `&&` record through the MCP
    // surface. We embed the canonical correction in the
    // `validated_solution` (wrapped in backticks) so the consult
    // can extract it and surface the correction flow end-to-end.
    // The fake adapter assigns it id 1 because it is the first
    // stored record.
    const learnResult = await handleErrorLearn(
      tools,
      state,
      buildLearnInput({
        topic_key: "engram-rag/failures/sdd-apply/powershell-and",
        failure_signature:
          "Used `&&` to chain commands inside a PowerShell bash tool call.",
        trigger_terms: ["powershell", "&&", "powershell-and", "shell-chain"],
        validated_solution:
          "Replace `cmd1 && cmd2` with `cmd1; if ($?) { cmd2 }` in PowerShell.",
      }),
    );
    expect(learnResult.isError).toBeUndefined();
    const saved = parseJson<{ id: number; topic_key: string }>(learnResult);
    expect(saved.id).toBeGreaterThan(0);

    // Step 2 — consult via the MCP surface using the canonical
    // PowerShell `&&` task. The just-saved record must show up in
    // `consulted_ids` and produce the canonical correction.
    const preflightResult = await handleErrorPreflight(
      tools,
      state,
      powershellAndRequest,
    );
    expect(preflightResult.isError).toBeUndefined();
    const body = parseJson<{
      consulted_ids: number[];
      correction_candidates: string[];
      enforcement: { outcome: string; corrected_command?: string };
    }>(preflightResult);

    // The learned record is in the consulted set. This is the
    // architectural fact PR3 flagged: the saved memory MUST be
    // queryable by future consults.
    expect(body.consulted_ids).toContain(saved.id);
    // The canonical correction flows through the consult.
    expect(body.correction_candidates).toContain("cmd1; if ($?) { cmd2 }");
    expect(body.enforcement.outcome).toBe("correct");
    expect(body.enforcement.corrected_command).toBe("cmd1; if ($?) { cmd2 }");

    // Step 3 — the learn counter advanced; the consult counter
    // advanced; the consult is a "prevention" event.
    const stats = parseJson<{
      total_consults: number;
      total_learns: number;
      prevention_rate: number;
      repeat_error_rate: number;
    }>(handleErrorStats(state));
    expect(stats.total_consults).toBe(1);
    expect(stats.total_learns).toBe(1);
    expect(stats.prevention_rate).toBe(1);
    expect(stats.repeat_error_rate).toBe(0);
  });

  it("does not match records that belong to a different agent (content-sensitive loop)", async () => {
    // Counterpart of the previous test: prove that the loop is
    // content-sensitive. A learned record with a different
    // `agent_id` AND a topic_key outside the per-failure
    // namespace does NOT appear in a powershell consult whose
    // `agent_id` is `sdd-apply`. The planner only consults
    // records whose searchable text matches the request's
    // `agent_id` and triggers (`powershell`, `failures`, etc.).
    //
    // Note: the planner always includes the `failures` trigger,
    // so the unrelated record must live OUTSIDE the
    // `engram-rag/failures/...` namespace to avoid the catch-all
    // match.
    const tools = createFakeAdapter([]);
    const state = createOperationalMetricsState();
    await handleErrorLearn(
      tools,
      state,
      buildLearnInput({
        topic_key: "engram-rag/cross-agent-leak",
        agent_id: "sdd-verify",
        failure_kind: "spec",
        failure_signature: "totally unrelated failure",
        trigger_terms: ["unrelated", "trigger"],
      }),
    );
    // PowerShell consult with `sdd-apply` — the sdd-verify record
    // must not appear in the consulted set because the planner's
    // queries are scoped to `sdd-apply`.
    const preflightResult = await handleErrorPreflight(
      tools,
      state,
      powershellAndRequest,
    );
    const body = parseJson<{
      consulted_ids: number[];
      missing_expected_records: string[];
      enforcement: { outcome: string };
    }>(preflightResult);
    expect(body.consulted_ids).toEqual([]);
    expect(body.missing_expected_records).toContain("powershell");
    expect(body.enforcement.outcome).toBe("blocked");
  });

  it("treats a learn → re-learn of the same signature as a repeat (closes the counter loop)", async () => {
    const tools = createFakeAdapter([]);
    const state = createOperationalMetricsState();
    await handleErrorLearn(tools, state, buildLearnInput());
    const learnAgain = await handleErrorLearn(tools, state, buildLearnInput());
    expect(learnAgain.isError).toBeUndefined();
    const stats = parseJson<{ total_learns: number; repeat_error_rate: number }>(
      handleErrorStats(state),
    );
    expect(stats.total_learns).toBe(2);
    expect(stats.repeat_error_rate).toBe(0.5);
  });
});
