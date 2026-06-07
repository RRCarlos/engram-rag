import { describe, expect, it } from "vitest";
import {
  OperationalActionSchema,
  OperationalLearnInputSchema,
  OperationalMetricsSchema,
  OperationalPreflightInputSchema,
  parseOperationalLearnInput,
  parseOperationalPreflightInput,
} from "../../src/engram/EngramTools.js";
import {
  KnowledgeRecordSchema,
  type KnowledgeRecord,
} from "../../src/contracts/knowledgeRecord.js";
import { CANONICAL_PROTOCOL_TOPIC_KEY } from "../../src/contracts/topicKeys.js";

/**
 * Contracts for the operational MCP surface (PR3 / #29).
 *
 * The operational layer is a thin projection over the underlying
 * memory tools: `error_preflight` reuses the PR1+PR2 consult engine
 * (`runPreflight` + `evaluateEnforcement`), `error_learn` reuses
 * `mem_save`, and `error_stats` reads the in-process operational
 * metrics state. These tests pin the contract shape so future
 * changes cannot accidentally let the MCP surface drift from the
 * CLI.
 */

function buildValidRecord(overrides: Partial<KnowledgeRecord> = {}): KnowledgeRecord {
  return KnowledgeRecordSchema.parse({
    schema_version: "2.0",
    topic_key: "engram-rag/failures/sdd-apply/powershell-and",
    canonical_protocol_topic_key: CANONICAL_PROTOCOL_TOPIC_KEY,
    agent_id: "sdd-apply",
    failure_kind: "shell",
    failure_signature: "&& in PowerShell command",
    trigger_terms: ["powershell", "&&", "shell-chain"],
    validated_solution: "Use `; if ($?) { ... }` instead of `&&` in PowerShell.",
    evidence_refs: ["docs/evidence/v1-forensics.md"],
    validation_status: "validated",
    last_validated_at: "2026-06-05T15:30:00.000Z",
    ...overrides,
  });
}

describe("OperationalActionSchema", () => {
  it("accepts every documented action kind", () => {
    for (const kind of [
      "read",
      "write",
      "shell",
      "spec",
      "design",
      "verify",
      "review",
    ] as const) {
      expect(OperationalActionSchema.parse(kind)).toBe(kind);
    }
  });

  it("rejects an unknown action literal", () => {
    expect(OperationalActionSchema.safeParse("deploy").success).toBe(false);
  });

  it("rejects a missing value", () => {
    expect(OperationalActionSchema.safeParse(undefined).success).toBe(false);
  });
});

describe("OperationalPreflightInputSchema", () => {
  it("accepts a fully-valid RetrievalRequest-shaped payload", () => {
    const parsed = parseOperationalPreflightInput({
      project: "engram-rag",
      agent_id: "sdd-apply",
      task_text: "Run `cd foo && npm install` in PowerShell.",
      action_kind: "shell",
      shell: "powershell",
    });
    expect(parsed.action_kind).toBe("shell");
    expect(parsed.shell).toBe("powershell");
    expect(parsed.cwd).toBeUndefined();
  });

  it("accepts a payload that omits the optional shell field", () => {
    const parsed = parseOperationalPreflightInput({
      project: "engram-rag",
      agent_id: "sdd-apply",
      task_text: "Read the PR1 verify report.",
      action_kind: "read",
    });
    expect(parsed.shell).toBeUndefined();
    expect(parsed.action_kind).toBe("read");
  });

  it("rejects a missing task_text", () => {
    const result = OperationalPreflightInputSchema.safeParse({
      project: "engram-rag",
      agent_id: "sdd-apply",
      action_kind: "read",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown action_kind literal", () => {
    const result = OperationalPreflightInputSchema.safeParse({
      project: "engram-rag",
      agent_id: "sdd-apply",
      task_text: "x",
      action_kind: "deploy",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown shell literal", () => {
    const result = OperationalPreflightInputSchema.safeParse({
      project: "engram-rag",
      agent_id: "sdd-apply",
      task_text: "x",
      action_kind: "shell",
      shell: "cmd",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty project", () => {
    const result = OperationalPreflightInputSchema.safeParse({
      project: "",
      agent_id: "sdd-apply",
      task_text: "x",
      action_kind: "read",
    });
    expect(result.success).toBe(false);
  });

  it("parseOperationalPreflightInput throws on invalid input", () => {
    expect(() =>
      parseOperationalPreflightInput({ project: "p", agent_id: "sdd-apply", task_text: "x", action_kind: "no" }),
    ).toThrow();
  });
});

describe("OperationalLearnInputSchema", () => {
  it("accepts a valid KnowledgeRecord as the learn payload", () => {
    const record = buildValidRecord();
    const parsed = parseOperationalLearnInput(record);
    expect(parsed.topic_key).toBe(record.topic_key);
    expect(parsed.failure_signature).toBe(record.failure_signature);
  });

  it("rejects a payload missing the canonical protocol key", () => {
    const broken = {
      ...buildValidRecord(),
      canonical_protocol_topic_key: "engram-rag/agent-rigor-protocol/v9",
    };
    expect(OperationalLearnInputSchema.safeParse(broken).success).toBe(false);
  });

  it("rejects a payload missing the validated_solution", () => {
    const broken = { ...buildValidRecord(), validated_solution: "" };
    expect(OperationalLearnInputSchema.safeParse(broken).success).toBe(false);
  });

  it("parseOperationalLearnInput throws on an empty object", () => {
    expect(() => parseOperationalLearnInput({})).toThrow();
  });
});

describe("OperationalMetricsSchema", () => {
  it("accepts a fully-valid metrics snapshot", () => {
    const parsed = OperationalMetricsSchema.parse({
      preflight_coverage: 0.75,
      retrieval_hit_rate: 0.5,
      application_rate: 0.25,
      repeat_error_rate: 0.1,
      prevention_rate: 0.4,
      total_consults: 4,
      total_learns: 2,
    });
    expect(parsed.preflight_coverage).toBe(0.75);
    expect(parsed.total_consults).toBe(4);
  });

  it("rejects a rate above 1", () => {
    const result = OperationalMetricsSchema.safeParse({
      preflight_coverage: 1.2,
      retrieval_hit_rate: 0,
      application_rate: 0,
      repeat_error_rate: 0,
      prevention_rate: 0,
      total_consults: 0,
      total_learns: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a negative rate", () => {
    const result = OperationalMetricsSchema.safeParse({
      preflight_coverage: -0.1,
      retrieval_hit_rate: 0,
      application_rate: 0,
      repeat_error_rate: 0,
      prevention_rate: 0,
      total_consults: 0,
      total_learns: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative counters", () => {
    const result = OperationalMetricsSchema.safeParse({
      preflight_coverage: 0,
      retrieval_hit_rate: 0,
      application_rate: 0,
      repeat_error_rate: 0,
      prevention_rate: 0,
      total_consults: -1,
      total_learns: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing required rate", () => {
    const result = OperationalMetricsSchema.safeParse({
      preflight_coverage: 0,
      retrieval_hit_rate: 0,
      application_rate: 0,
      repeat_error_rate: 0,
      total_consults: 0,
      total_learns: 0,
    });
    expect(result.success).toBe(false);
  });
});
