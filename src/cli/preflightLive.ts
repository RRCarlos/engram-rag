import { pathToFileURL } from "node:url";
import { parseRetrievalRequest, type ActionKind, type ShellKind } from "../contracts/retrieval.js";
import type { AgentId } from "../contracts/knowledgeRecord.js";
import type { EngramTools } from "../engram/EngramTools.js";
import { createLiveAdapter, type LiveEngramAdapter } from "../engram/liveEngramAdapter.js";
import { runPreflight, type PreflightResult } from "../engram/runPreflight.js";

const AGENTS = new Set<AgentId>([
  "sdd-apply",
  "sdd-spec",
  "sdd-design",
  "sdd-verify",
  "sdd-explore",
  "sdd-tasks",
  "sdd-propose",
  "sdd-archive",
  "sdd-init",
  "sdd-onboard",
]);
const ACTIONS = new Set<ActionKind>(["read", "write", "shell", "spec", "design", "verify", "review"]);
const SHELLS = new Set<ShellKind>(["powershell", "bash", "unknown"]);

interface ParsedArgs {
  project: string;
  agent: AgentId;
  task: string;
  action: ActionKind;
  shell?: ShellKind;
  cwd?: string;
  baseUrl: string;
}

export interface PreflightLiveCliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type LiveAdapterFactory = (args: ParsedArgs) => EngramTools & Partial<Pick<LiveEngramAdapter, "healthCheck">>;

function usage(): string {
  return [
    "Usage: engram-rag preflight-live --project <name> --agent <agent> --task <text> --action <kind> [--shell <kind>] [--cwd <path>] [--base-url <url>]",
    "Exit codes: 0 ok, 1 invalid flags, 2 degraded result (safe actions only), 3 live Engram unavailable or request failed, 4 enforcement blocked or corrected (do not proceed as-is).",
  ].join("\n");
}

function parseArgs(argv: string[]): ParsedArgs {
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) throw new Error(`Unexpected positional argument: ${arg}`);
    const key = arg.slice(2);
    if (!["project", "agent", "task", "action", "shell", "cwd", "base-url"].includes(key)) {
      throw new Error(`Unknown flag: ${arg}`);
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
    values.set(key, value);
    i += 1;
  }

  const project = values.get("project");
  const agent = values.get("agent") as AgentId | undefined;
  const task = values.get("task");
  const action = values.get("action") as ActionKind | undefined;
  const shell = values.get("shell") as ShellKind | undefined;
  const cwd = values.get("cwd");
  const baseUrl = values.get("base-url") ?? "http://127.0.0.1:7437";

  if (!project || !agent || !task || !action) {
    throw new Error("Missing required flags: --project, --agent, --task, --action");
  }
  if (!AGENTS.has(agent)) throw new Error(`Invalid agent: ${agent}`);
  if (!ACTIONS.has(action)) throw new Error(`Invalid action: ${action}`);
  if (shell !== undefined && !SHELLS.has(shell)) throw new Error(`Invalid shell: ${shell}`);

  // Under `exactOptionalPropertyTypes: true` we must omit optional
  // fields rather than assigning `undefined` to them, so build the
  // result conditionally.
  const result: ParsedArgs = { project, agent, task, action, baseUrl };
  if (shell !== undefined) result.shell = shell;
  if (cwd !== undefined) result.cwd = cwd;
  return result;
}

function projectResult(result: PreflightResult): unknown {
  const enforcement: Record<string, unknown> = {
    outcome: result.enforcement.outcome,
    reason: result.enforcement.reason,
    consulted_ids: result.enforcement.consulted_ids,
    missing_expected_records: result.enforcement.missing_expected_records,
    quarantined_records: result.enforcement.quarantined_records,
    trace_id: result.enforcement.trace_id,
    stable_trace_id: result.enforcement.stable_trace_id,
  };
  if (result.enforcement.corrected_command !== undefined) {
    enforcement.corrected_command = result.enforcement.corrected_command;
  }
  return {
    applied_rules: result.applied_rules,
    consulted_ids: result.consulted_ids,
    quarantined_records: result.quarantined_records,
    correction_candidates: result.correction_candidates,
    missing_expected_records: result.missing_expected_records,
    degraded: result.degraded,
    latency_ms: result.latency_ms,
    records: result.records.map((record, index) => ({
      id: result.consulted_ids[index],
      topic_key: record.topic_key,
      agent_id: record.agent_id,
      failure_kind: record.failure_kind,
      failure_signature: record.failure_signature,
      validation_status: record.validation_status,
    })),
    enforcement,
  };
}

function exitCodeFor(result: PreflightResult): number {
  if (
    result.enforcement.outcome === "correct" ||
    result.enforcement.outcome === "blocked"
  ) {
    return 4;
  }
  return result.degraded ? 2 : 0;
}

export async function runPreflightLiveCli(
  argv: string[],
  adapterFactory: LiveAdapterFactory = (args) =>
    createLiveAdapter({ baseUrl: args.baseUrl, project: args.project, scope: "project" }),
): Promise<PreflightLiveCliResult> {
  let args: ParsedArgs;
  try {
    args = parseArgs(argv);
  } catch (error) {
    return { exitCode: 1, stdout: "", stderr: `${(error as Error).message}\n${usage()}\n` };
  }

  try {
    const adapter = adapterFactory(args);
    if (adapter.healthCheck !== undefined && !(await adapter.healthCheck())) {
      return {
        exitCode: 3,
        stdout: "",
        stderr: `Live Engram unavailable at ${args.baseUrl}. Start Engram or retry later.\n`,
      };
    }
    const request = parseRetrievalRequest({
      project: args.project,
      agent_id: args.agent,
      task_text: args.task,
      action_kind: args.action,
      shell: args.shell,
      cwd: args.cwd,
    });
    const result = await runPreflight(request, adapter);
    return {
      exitCode: exitCodeFor(result),
      stdout: `${JSON.stringify(projectResult(result), null, 2)}\n`,
      stderr: "",
    };
  } catch (error) {
    return { exitCode: 3, stdout: "", stderr: `${(error as Error).message}\n` };
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  runPreflightLiveCli(process.argv.slice(2)).then((result) => {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    process.exitCode = result.exitCode;
  });
}
