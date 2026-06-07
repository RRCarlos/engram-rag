import {
  parseOperationalLearnInput,
  parseOperationalPreflightInput,
  type EngramTools,
  type MemSaveInput,
  type OperationalMetrics,
  type OperationalPreflightInput,
} from "../engram/EngramTools.js";
import { runPreflight, type PreflightResult } from "../engram/runPreflight.js";
import type { OperationalMetricsState } from "./operationalMetrics.js";

/**
 * Operational MCP tool surface (PR3 / #29).
 *
 * Three MCP tools are exposed:
 *
 *   - `error_preflight` — runs the PR1+PR2 consult engine
 *     (`runPreflight` + `evaluateEnforcement`) against a
 *     `RetrievalRequest` and returns the full `PreflightResult`
 *     shape the live CLI projects. Also feeds the consult counters
 *     on the operational metrics state.
 *   - `error_learn`    — records a `KnowledgeRecord` via the
 *     underlying `mem_save` and updates the learn counters
 *     (`repeat_error_rate`).
 *   - `error_stats`    — returns a snapshot of the five operational
 *     metrics.
 *
 * This module is intentionally SDK-free. The MCP dispatch layer
 * (`src/mcp/ragServer.ts`) is the only place that imports the
 * `@modelcontextprotocol/sdk`; the handlers here return a
 * `ToolCallResult` shape the dispatcher projects into the SDK's
 * `CallToolResult` type. That separation keeps the
 * `test/guardrails/noLiveMcpInTests.test.ts` guardrail happy and
 * lets the handlers be unit-tested without the live SDK.
 */

export const OPERATIONAL_TOOL_NAMES = [
  "error_preflight",
  "error_learn",
  "error_stats",
] as const;
export type OperationalToolName = (typeof OPERATIONAL_TOOL_NAMES)[number];

export interface ToolCallResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export interface OperationalToolDescriptor {
  name: OperationalToolName;
  description: string;
  inputSchema: Record<string, unknown>;
}

const PREFLIGHT_INPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    project: { type: "string", description: "Project name." },
    agent_id: {
      type: "string",
      description: "Agent ID (one of the documented sdd-* agent ids).",
    },
    task_text: { type: "string", description: "Task description." },
    action_kind: {
      type: "string",
      enum: ["read", "write", "shell", "spec", "design", "verify", "review"],
      description: "Action kind the agent is about to perform.",
    },
    shell: {
      type: "string",
      enum: ["powershell", "bash", "unknown"],
      description: "Shell kind for shell actions (omit for non-shell).",
    },
    cwd: { type: "string", description: "Optional working directory." },
    files: {
      type: "array",
      items: { type: "string" },
      description: "Optional list of file paths the action will touch.",
    },
  },
  required: ["project", "agent_id", "task_text", "action_kind"],
};

const LEARN_INPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    schema_version: { type: "string", enum: ["2.0"] },
    topic_key: { type: "string" },
    canonical_protocol_topic_key: { type: "string" },
    agent_id: { type: "string" },
    failure_kind: { type: "string" },
    failure_signature: { type: "string" },
    trigger_terms: { type: "array", items: { type: "string" } },
    validated_solution: { type: "string" },
    evidence_refs: { type: "array", items: { type: "string" } },
    validation_status: {
      type: "string",
      enum: ["validated", "superseded", "draft"],
    },
    last_validated_at: { type: "string", description: "ISO 8601 timestamp" },
  },
  required: [
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
  ],
};

const STATS_INPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {},
  additionalProperties: false,
};

export function listOperationalTools(): OperationalToolDescriptor[] {
  return [
    {
      name: "error_preflight",
      description:
        "Run an operational preflight consult for an agent action. Returns the typed PreflightResult " +
        "and enforcement decision, identical to the live preflight CLI output.",
      inputSchema: PREFLIGHT_INPUT_SCHEMA,
    },
    {
      name: "error_learn",
      description:
        "Record a failure or promotion KnowledgeRecord. Persists the record via the underlying " +
        "Engram memory adapter and updates the operational learn counters.",
      inputSchema: LEARN_INPUT_SCHEMA,
    },
    {
      name: "error_stats",
      description:
        "Snapshot of aggregate operational metrics: preflight_coverage, retrieval_hit_rate, " +
        "application_rate, repeat_error_rate, prevention_rate.",
      inputSchema: STATS_INPUT_SCHEMA,
    },
  ];
}

function errorResult(message: string): ToolCallResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

function jsonResult(value: unknown): ToolCallResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

export async function handleErrorPreflight(
  tools: EngramTools,
  metrics: OperationalMetricsState,
  args: unknown,
): Promise<ToolCallResult> {
  let request: OperationalPreflightInput;
  try {
    request = parseOperationalPreflightInput(args);
  } catch (err) {
    return errorResult(`Invalid input for error_preflight: ${(err as Error).message}`);
  }
  try {
    const result: PreflightResult = await runPreflight(request, tools);
    metrics.recordConsult(result);
    return jsonResult(result);
  } catch (err) {
    return errorResult(`error_preflight failed: ${(err as Error).message ?? String(err)}`);
  }
}

export async function handleErrorLearn(
  tools: EngramTools,
  metrics: OperationalMetricsState,
  args: unknown,
): Promise<ToolCallResult> {
  let input: MemSaveInput;
  try {
    input = parseOperationalLearnInput(args);
  } catch (err) {
    return errorResult(`Invalid input for error_learn: ${(err as Error).message}`);
  }
  try {
    const saved = await tools.mem_save(input);
    metrics.recordLearn(input);
    return jsonResult(saved);
  } catch (err) {
    return errorResult(`error_learn failed: ${(err as Error).message ?? String(err)}`);
  }
}

export function handleErrorStats(
  metrics: OperationalMetricsState,
): ToolCallResult {
  const snapshot: OperationalMetrics = metrics.snapshot();
  return jsonResult(snapshot);
}

export async function dispatchOperationalTool(
  name: string,
  tools: EngramTools,
  metrics: OperationalMetricsState,
  args: unknown,
): Promise<ToolCallResult> {
  switch (name) {
    case "error_preflight":
      return handleErrorPreflight(tools, metrics, args);
    case "error_learn":
      return handleErrorLearn(tools, metrics, args);
    case "error_stats":
      return handleErrorStats(metrics);
    default:
      return errorResult(`Unknown operational tool: ${name}`);
  }
}
