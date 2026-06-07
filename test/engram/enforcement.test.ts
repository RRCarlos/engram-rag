import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseKnowledgeRecord, type KnowledgeRecord } from "../../src/contracts/knowledgeRecord.js";
import type { RetrievalRequest } from "../../src/contracts/retrieval.js";
import {
  evaluateEnforcement,
  findCorrectedCommand,
  isHighRiskAction,
  isPowershellAndRisk,
  POWERSHELL_PLACEHOLDER_CORRECTION,
  rewritePowershellAnd,
} from "../../src/engram/enforcement.js";
import { createFakeAdapter } from "../../src/engram/fakeEngramAdapter.js";
import { runPreflight } from "../../src/engram/runPreflight.js";

function fixture(path: string): KnowledgeRecord {
  const url = new URL(`../../fixtures/knowledge/${path}`, import.meta.url);
  return parseKnowledgeRecord(JSON.parse(readFileSync(url, "utf8")));
}

const powershellAndRequest: RetrievalRequest = {
  project: "engram-rag",
  agent_id: "sdd-apply",
  task_text: "Run `cd foo && npm install` in PowerShell.",
  action_kind: "shell",
  shell: "powershell",
};

const cleanPowerShellRequest: RetrievalRequest = {
  project: "engram-rag",
  agent_id: "sdd-apply",
  task_text: "Run npm install in PowerShell cleanly.",
  action_kind: "shell",
  shell: "powershell",
};

const powershellWriteRequest: RetrievalRequest = {
  project: "engram-rag",
  agent_id: "sdd-apply",
  task_text: "Edit the doc safely.",
  action_kind: "write",
  shell: "powershell",
};

const cleanWriteRequest: RetrievalRequest = {
  project: "engram-rag",
  agent_id: "sdd-apply",
  task_text: "Edit the doc safely.",
  action_kind: "write",
};

async function runCleanPreflight(
  request: RetrievalRequest = powershellAndRequest,
  records: KnowledgeRecord[] = [fixture("powershell-and.json")],
): Promise<Awaited<ReturnType<typeof runPreflight>>> {
  return runPreflight(request, createFakeAdapter(records));
}

describe("enforcement: action classification", () => {
  it("flags shell and write as high-risk", () => {
    expect(isHighRiskAction("shell")).toBe(true);
    expect(isHighRiskAction("write")).toBe(true);
  });

  it("treats read/spec/design/verify/review as safe", () => {
    expect(isHighRiskAction("read")).toBe(false);
    expect(isHighRiskAction("spec")).toBe(false);
    expect(isHighRiskAction("design")).toBe(false);
    expect(isHighRiskAction("verify")).toBe(false);
    expect(isHighRiskAction("review")).toBe(false);
  });
});

describe("enforcement: PowerShell && detection", () => {
  it("matches PowerShell shell actions whose task text contains &&", () => {
    expect(isPowershellAndRisk(powershellAndRequest)).toBe(true);
  });

  it("does not match PowerShell tasks without &&", () => {
    expect(isPowershellAndRisk(cleanPowerShellRequest)).toBe(false);
  });

  it("does not match bash tasks with &&", () => {
    expect(
      isPowershellAndRisk({ ...powershellAndRequest, shell: "bash" }),
    ).toBe(false);
  });

  it("does not match non-shell actions with &&", () => {
    expect(
      isPowershellAndRisk({ ...powershellAndRequest, action_kind: "read" }),
    ).toBe(false);
  });
});

describe("enforcement: PowerShell && rewrite helper", () => {
  it("rewrites a clean two-token cmd1 && cmd2 input", () => {
    expect(rewritePowershellAnd("foo && bar")).toBe("foo; if ($?) { bar }");
    expect(rewritePowershellAnd("npm.cmd && build.ps1")).toBe(
      "npm.cmd; if ($?) { build.ps1 }",
    );
  });

  it("returns undefined for multi-word or prose inputs", () => {
    expect(rewritePowershellAnd("cd foo && npm install")).toBeUndefined();
    expect(rewritePowershellAnd("echo hi && exit")).toBeUndefined();
    expect(rewritePowershellAnd("Use `cmd1 && cmd2` here")).toBeUndefined();
  });

  it("returns undefined when && is absent", () => {
    expect(rewritePowershellAnd("npm install")).toBeUndefined();
  });
});

describe("enforcement: findCorrectedCommand", () => {
  it("prefers the canonical placeholder from correction_candidates", () => {
    const candidate = findCorrectedCommand(powershellAndRequest, [
      "Use this pattern",
      POWERSHELL_PLACEHOLDER_CORRECTION,
    ]);
    expect(candidate).toBe(POWERSHELL_PLACEHOLDER_CORRECTION);
  });

  it("falls back to any candidate with the rewrite pattern", () => {
    const candidate = findCorrectedCommand(powershellAndRequest, [
      "random text",
      "Try foo; if ($?) { bar } form",
    ]);
    expect(candidate).toBe("Try foo; if ($?) { bar } form");
  });

  it("falls back to an in-place rewrite when the task text is a clean two-token command", () => {
    const candidate = findCorrectedCommand(
      { ...powershellAndRequest, task_text: "foo && bar" },
      [],
    );
    expect(candidate).toBe("foo; if ($?) { bar }");
  });

  it("returns undefined when no candidate and no obvious rewrite exist", () => {
    const candidate = findCorrectedCommand(
      { ...powershellAndRequest, task_text: "nothing useful here" },
      [],
    );
    expect(candidate).toBeUndefined();
  });
});

describe("evaluateEnforcement: risky block/rewrite cases", () => {
  it("returns correct with the canonical PowerShell correction when && is detected", async () => {
    const result = await runCleanPreflight();
    const enforcement = evaluateEnforcement({
      request: powershellAndRequest,
      result,
    });

    expect(enforcement.outcome).toBe("correct");
    expect(enforcement.corrected_command).toBe(POWERSHELL_PLACEHOLDER_CORRECTION);
    expect(enforcement.consulted_ids).toContain(1);
    expect(enforcement.missing_expected_records).toEqual([]);
    expect(enforcement.quarantined_records).toEqual([]);
    expect(enforcement.reason).toContain("PowerShell");
    expect(enforcement.trace_id).toMatch(/^trc-[0-9a-f]{16}$/);
  });

  it("returns blocked for shell actions when preflight is degraded", async () => {
    const adapter = createFakeAdapter([fixture("powershell-and.json")], {
      failureMode: "throw",
      failOn: ["mem_search"],
    });
    const result = await runPreflight(powershellAndRequest, adapter);
    const enforcement = evaluateEnforcement({
      request: powershellAndRequest,
      result,
    });

    expect(enforcement.outcome).toBe("blocked");
    expect(enforcement.reason).toContain("degraded");
    expect(enforcement.missing_expected_records).toContain("powershell");
    expect(enforcement.corrected_command).toBeUndefined();
  });

  it("returns blocked for write actions when expected powershell records are missing", async () => {
    const result = await runPreflight(
      powershellWriteRequest,
      createFakeAdapter([]),
    );
    const enforcement = evaluateEnforcement({
      request: powershellWriteRequest,
      result,
    });

    expect(enforcement.outcome).toBe("blocked");
    expect(enforcement.reason).toContain("missing expected records");
    expect(enforcement.missing_expected_records).toContain("powershell");
  });

  it("returns blocked for PowerShell && tasks when no correction candidate is available", () => {
    const blockedRequest: RetrievalRequest = {
      ...powershellAndRequest,
      task_text: "Use `cmd1 && cmd2` here without a clean command",
    };
    const result = {
      request: blockedRequest,
      records: [],
      applied_rules: [],
      consulted_ids: [],
      quarantined_records: [],
      correction_candidates: [],
      missing_expected_records: [],
      latency_ms: 0,
      degraded: false,
      enforcement: undefined as never,
    };
    const enforcement = evaluateEnforcement({
      request: blockedRequest,
      result,
    });

    expect(enforcement.outcome).toBe("blocked");
    expect(enforcement.reason).toContain("no correction candidate");
  });
});

describe("evaluateEnforcement: safe/no-op cases", () => {
  it("returns allow for a PowerShell task without &&", async () => {
    const result = await runCleanPreflight(cleanPowerShellRequest);
    const enforcement = evaluateEnforcement({
      request: cleanPowerShellRequest,
      result,
    });

    expect(enforcement.outcome).toBe("allow");
    expect(enforcement.corrected_command).toBeUndefined();
    expect(enforcement.missing_expected_records).toEqual([]);
  });

  it("returns allow for a bash task with && (bash supports it natively)", async () => {
    const bashAndRequest: RetrievalRequest = {
      ...powershellAndRequest,
      shell: "bash",
    };
    const result = await runCleanPreflight(bashAndRequest);
    const enforcement = evaluateEnforcement({
      request: bashAndRequest,
      result,
    });

    expect(enforcement.outcome).toBe("allow");
    expect(enforcement.corrected_command).toBeUndefined();
  });

  it("returns allow for a clean write action with no missing expected records", async () => {
    const result = await runPreflight(
      cleanWriteRequest,
      createFakeAdapter([fixture("powershell-and.json")]),
    );
    const enforcement = evaluateEnforcement({
      request: cleanWriteRequest,
      result,
    });

    expect(enforcement.outcome).toBe("allow");
    expect(enforcement.missing_expected_records).toEqual([]);
  });

  it("returns allow for read actions even when preflight is degraded (safe action)", async () => {
    const readRequest: RetrievalRequest = {
      ...powershellAndRequest,
      action_kind: "read",
    };
    const adapter = createFakeAdapter([fixture("powershell-and.json")], {
      failureMode: "throw",
      failOn: ["mem_search"],
    });
    const result = await runPreflight(readRequest, adapter);
    const enforcement = evaluateEnforcement({
      request: readRequest,
      result,
    });

    expect(enforcement.outcome).toBe("allow");
    expect(enforcement.reason).toContain("safe");
  });
});

describe("evaluateEnforcement: determinism and trace shape", () => {
  it("produces a deterministic trace id for the same inputs", async () => {
    const result = await runCleanPreflight();
    const first = evaluateEnforcement({ request: powershellAndRequest, result });
    const second = evaluateEnforcement({ request: powershellAndRequest, result });

    expect(first.trace_id).toBe(second.trace_id);
    expect(first.outcome).toBe(second.outcome);
  });

  it("emits different trace ids for different outcomes", async () => {
    const cleanResult = await runCleanPreflight(cleanPowerShellRequest);
    const allow = evaluateEnforcement({
      request: cleanPowerShellRequest,
      result: cleanResult,
    });
    const correctedResult = await runCleanPreflight();
    const correct = evaluateEnforcement({
      request: powershellAndRequest,
      result: correctedResult,
    });

    expect(allow.outcome).toBe("allow");
    expect(correct.outcome).toBe("correct");
    expect(allow.trace_id).not.toBe(correct.trace_id);
  });

  it("projects consulted ids, missing records, and quarantines faithfully", async () => {
    const result = await runCleanPreflight();
    const enforcement = evaluateEnforcement({
      request: powershellAndRequest,
      result,
    });

    expect(enforcement.consulted_ids).toEqual(result.consulted_ids);
    expect(enforcement.missing_expected_records).toEqual(
      result.missing_expected_records,
    );
    expect(enforcement.quarantined_records).toEqual(result.quarantined_records);
  });
});
