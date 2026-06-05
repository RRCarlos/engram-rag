import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseKnowledgeRecord, type AgentId } from "../contracts/knowledgeRecord.js";
import { parseRetrievalRequest, type ActionKind, type ShellKind } from "../contracts/retrieval.js";
import { createFakeAdapter } from "../engram/fakeEngramAdapter.js";
import { runPreflight } from "../engram/runPreflight.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..", "..");

interface ParsedArgs {
  project: string;
  agent: AgentId;
  taskFile: string;
  action: ActionKind;
  shell: ShellKind;
  json: boolean;
  simulateDegraded: boolean;
}

type CliResult = { exitCode: number; stdout: string; stderr: string };

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

function usage(): string {
  return [
    "Usage: engram-rag preflight --project <name> --agent <agent> --task-file <path> [--action <kind>] [--shell <kind>] [--json]",
    "Exit codes: 0 ok, 1 invalid flags, 2 degraded adapter result, 3 invalid task/request.",
  ].join("\n");
}

function parseArgs(argv: string[]): ParsedArgs {
  const values = new Map<string, string>();
  let json = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--simulate-degraded") {
      values.set("simulate-degraded", "true");
      continue;
    }
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected positional argument: ${arg}`);
    }
    const key = arg.slice(2);
    if (!["project", "agent", "task-file", "action", "shell"].includes(key)) {
      throw new Error(`Unknown flag: ${arg}`);
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${arg}`);
    }
    values.set(key, value);
    i += 1;
  }

  const project = values.get("project");
  const agent = values.get("agent") as AgentId | undefined;
  const taskFile = values.get("task-file");
  const action = (values.get("action") ?? "shell") as ActionKind;
  const shell = (values.get("shell") ?? "unknown") as ShellKind;

  if (project === undefined || agent === undefined || taskFile === undefined) {
    throw new Error("Missing required flags: --project, --agent, --task-file");
  }
  if (!AGENTS.has(agent)) throw new Error(`Invalid agent: ${agent}`);
  if (!ACTIONS.has(action)) throw new Error(`Invalid action: ${action}`);
  if (!SHELLS.has(shell)) throw new Error(`Invalid shell: ${shell}`);

  return {
    project,
    agent,
    taskFile,
    action,
    shell,
    json,
    simulateDegraded: values.get("simulate-degraded") === "true",
  };
}

function loadFixtures() {
  return ["powershell-and.json", "sdd-spec-gherkin.json"].map((name) => {
    const file = resolve(REPO_ROOT, "fixtures", "knowledge", name);
    return parseKnowledgeRecord(JSON.parse(readFileSync(file, "utf8")));
  });
}

export async function runPreflightCli(argv: string[]): Promise<CliResult> {
  let args: ParsedArgs;
  try {
    args = parseArgs(argv);
  } catch (error) {
    return { exitCode: 1, stdout: "", stderr: `${(error as Error).message}\n${usage()}\n` };
  }

  const taskPath = resolve(process.cwd(), args.taskFile);
  if (!existsSync(taskPath)) {
    return { exitCode: 3, stdout: "", stderr: `Task file not found: ${args.taskFile}\n` };
  }

  try {
    const taskText = readFileSync(taskPath, "utf8");
    const request = parseRetrievalRequest({
      project: args.project,
      agent_id: args.agent,
      task_text: taskText,
      action_kind: args.action,
      shell: args.shell,
      files: [args.taskFile],
    });
    const adapter = createFakeAdapter(
      loadFixtures(),
      args.simulateDegraded
        ? { failureMode: "throw", failOn: ["mem_search"] }
        : {},
    );
    const result = await runPreflight(request, adapter);
    const stdout = args.json
      ? `${JSON.stringify(result, null, 2)}\n`
      : [
          `Engram preflight for ${request.agent_id}`,
          `records=${result.records.length}`,
          `degraded=${String(result.degraded)}`,
          `latency_ms=${result.latency_ms.toFixed(2)}`,
        ].join("\n") + "\n";
    return { exitCode: result.degraded ? 2 : 0, stdout, stderr: "" };
  } catch (error) {
    return { exitCode: 3, stdout: "", stderr: `${(error as Error).message}\n` };
  }
}

async function main(): Promise<void> {
  const result = await runPreflightCli(process.argv.slice(2));
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exit(result.exitCode);
}

if (resolve(process.argv[1] ?? "") === __filename) {
  void main();
}
