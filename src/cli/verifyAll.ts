/**
 * Unified verification entry point (PR5 / #31).
 *
 * `npm run verify:all` (alias `npm test:verify`) runs the focused
 * tests, the type check, the guardrails, and the MCP smoke check
 * end-to-end. It optionally runs a live P0 smoke against an Engram
 * instance when `ENGRAM_BASE_URL` and `ENGRAM_PROJECT` are set, so
 * the same command works locally and in CI.
 *
 * The previous `test:verify` script recursed into Vitest
 * (`vitest run test/cli/verifyPhase*.test.ts` re-spawns the suite
 * from inside `verifyPhase1.ts`, which already runs Vitest). That
 * recursion is the failure mode the spec scenario
 * "Stable verify commands" requires us to remove. The new entry
 * point is non-recursive: it does NOT spawn itself and it does NOT
 * re-spawn the suite it just ran.
 *
 * Exit code matrix (stable across all PR5 / #31 surfaces; mirrors
 * the table in `README.md`):
 *
 *   - 0  every check passed
 *   - 1  invalid flags or argument shape
 *   - 2  one or more focused tests / guardrails / type checks failed
 *   - 3  I/O error, broken toolchain, or subprocess crashed
 *   - 4  reserved (P0 acceptance: live smoke returned blocked/correct)
 *        — never returned by verify:all itself
 *   - 5  reserved (internal error). No CLI in this repo currently
 *        emits 5; the slot is documented so a future contributor who
 *        needs to surface an uncaught-internal error does not collide
 *        with an already-used code.
 *
 *   The preflight CLIs use the same 0/1/2/3/4 matrix; see
 *   `src/cli/preflight.ts` and `src/cli/preflightLive.ts` for the
 *   production semantics.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runMcpSmoke } from "./mcpSmoke.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..", "..");

/** Path the focused-test JSON reporter dumps. */
const FOCUSED_REPORT = resolve(REPO_ROOT, "reports", "verify-all", "focused.json");
/** Path the unified verify report is written to. */
const VERIFY_REPORT = resolve(REPO_ROOT, "reports", "verify-all", "verify-report.json");

/** Focused test files: the operational loop and the preflight CLIs. */
const FOCUSED_TEST_FILES = [
  "test/engram/trace.test.ts",
  "test/engram/enforcement.test.ts",
  "test/engram/runPreflight.test.ts",
  "test/engram/operationalContracts.test.ts",
  "test/mcp/operationalTools.test.ts",
  "test/mcp/operationalMetrics.persistence.test.ts",
  "test/eval/fakeLiveParity.test.ts",
  "test/cli/preflight.test.ts",
  "test/cli/preflightLive.test.ts",
] as const;

/** Guardrail test files: the static surface rules. */
const GUARDRAIL_TEST_FILES = [
  "test/guardrails/noLegacyTopicKeys.test.ts",
  "test/guardrails/noLiveMcpInTests.test.ts",
  "test/guardrails/engramConfigShape.test.ts",
  "test/ci/workflow.test.ts",
] as const;

export interface CheckResult {
  id: string;
  description: string;
  pass: boolean;
  exit_code: number;
  duration_ms: number;
  detail: string;
  stdout_tail: string;
  stderr_tail: string;
}

export interface VerifyAllReport {
  command: string;
  started_at: string;
  finished_at: string;
  exit_code: number;
  checks: CheckResult[];
  focused_files: string[];
  guardrail_files: string[];
  live_p0_smoke_run: boolean;
  live_p0_smoke: LiveP0SmokeResult | null;
  mcp_smoke: ReturnType<typeof runMcpSmoke> | null;
  summary: {
    passed: number;
    failed: number;
    total: number;
  };
}

export interface LiveP0SmokeResult {
  ran: boolean;
  pass: boolean;
  exit_code: number;
  outcome: string;
  corrected_command: string | null;
  trace_id: string | null;
  consulted_ids: number[];
  detail: string;
  stdout_tail: string;
  stderr_tail: string;
}

interface SpawnResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

function repoPath(...parts: string[]): string {
  return resolve(REPO_ROOT, ...parts);
}

async function runProcess(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<SpawnResult> {
  const startedAt = Date.now();
  return new Promise((resolveRun) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? REPO_ROOT,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
      // No shell. Args are forwarded verbatim so Windows paths with
      // spaces work without quoting.
      shell: false,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      resolveRun({
        exitCode: 127,
        stdout,
        stderr: `${stderr}\n[verify:all] failed to spawn ${command}: ${err.message}`,
        durationMs: Date.now() - startedAt,
      });
    });
    child.on("exit", (code) => {
      resolveRun({
        exitCode: code ?? 1,
        stdout,
        stderr,
        durationMs: Date.now() - startedAt,
      });
    });
  });
}

function tail(text: string, max = 800): string {
  if (text.length <= max) return text;
  return `…${text.slice(text.length - max)}`;
}

function summarizeFailure(detail: string): string {
  return detail.length > 200 ? `${detail.slice(0, 200)}…` : detail;
}

async function runVitest(files: readonly string[]): Promise<CheckResult> {
  const id = "vitest:focused";
  const description = `vitest run on ${files.length} focused test files`;
  const startedAt = Date.now();
  const args = [
    "--import",
    "tsx",
    "node_modules/vitest/vitest.mjs",
    "run",
    "--reporter=default",
    ...files,
  ];
  const result = await runProcess(process.execPath, args);
  return {
    id,
    description,
    pass: result.exitCode === 0,
    exit_code: result.exitCode,
    duration_ms: result.durationMs,
    detail: summarizeFailure(
      `ran ${files.length} files; exit=${result.exitCode} duration=${result.durationMs}ms`,
    ),
    stdout_tail: tail(result.stdout),
    stderr_tail: tail(result.stderr),
  };
}

async function runGuardrailTests(): Promise<CheckResult> {
  const id = "vitest:guardrails";
  const description = `vitest run on ${GUARDRAIL_TEST_FILES.length} guardrail test files`;
  const startedAt = Date.now();
  const args = [
    "--import",
    "tsx",
    "node_modules/vitest/vitest.mjs",
    "run",
    "--reporter=default",
    ...GUARDRAIL_TEST_FILES,
  ];
  const result = await runProcess(process.execPath, args);
  return {
    id,
    description,
    pass: result.exitCode === 0,
    exit_code: result.exitCode,
    duration_ms: result.durationMs,
    detail: summarizeFailure(
      `guardrails pass=${result.exitCode === 0 ? "yes" : "no"} duration=${result.durationMs}ms`,
    ),
    stdout_tail: tail(result.stdout),
    stderr_tail: tail(result.stderr),
  };
}

async function runTypecheck(): Promise<CheckResult> {
  const id = "tsc:noemit";
  const description = "npx tsc --noEmit (TypeScript strict type check)";
  const startedAt = Date.now();
  const args = ["--import", "tsx", "node_modules/typescript/bin/tsc", "--noEmit"];
  const result = await runProcess(process.execPath, args);
  return {
    id,
    description,
    pass: result.exitCode === 0,
    exit_code: result.exitCode,
    duration_ms: result.durationMs,
    detail: summarizeFailure(
      `tsc exit=${result.exitCode} duration=${result.durationMs}ms`,
    ),
    stdout_tail: tail(result.stdout),
    stderr_tail: tail(result.stderr),
  };
}

async function runMcpSmokeCheck(): Promise<{
  check: CheckResult;
  report: ReturnType<typeof runMcpSmoke>;
}> {
  const id = "mcp:smoke";
  const description = "MCP smoke (tool surface + cross-platform launcher + no-rag-* guard)";
  const startedAt = Date.now();
  const report = runMcpSmoke();
  const duration = Date.now() - startedAt;
  const failed = report.checks.filter((c) => !c.pass);
  return {
    check: {
      id,
      description,
      pass: report.exit_code === 0,
      exit_code: report.exit_code,
      duration_ms: duration,
      detail:
        failed.length === 0
          ? `all ${report.checks.length} mcp:smoke checks passed`
          : `failed: ${failed.map((c) => c.id).join(", ")}`,
      stdout_tail: "",
      stderr_tail: "",
    },
    report,
  };
}

/**
 * Live P0 smoke: only run when `ENGRAM_BASE_URL` and `ENGRAM_PROJECT`
 * are set. The point is to prove the end-to-end P0 path
 * (`PowerShell && -> Engram #152 -> cmd1; if ($?) { cmd2 }`) still
 * works on a real Engram instance. CI does not set these env vars, so
 * the live check is opt-in and the script never blocks the build on
 * it.
 */
async function runLiveP0Smoke(): Promise<LiveP0SmokeResult> {
  const baseUrl = process.env.ENGRAM_BASE_URL;
  const project = process.env.ENGRAM_PROJECT;
  if (baseUrl === undefined || project === undefined || baseUrl.length === 0 || project.length === 0) {
    return {
      ran: false,
      pass: true,
      exit_code: 0,
      outcome: "skipped",
      corrected_command: null,
      trace_id: null,
      consulted_ids: [],
      detail:
        "ENGRAM_BASE_URL / ENGRAM_PROJECT not set; live P0 smoke skipped (safe in CI).",
      stdout_tail: "",
      stderr_tail: "",
    };
  }
  const args = [
    "--import",
    "tsx",
    "src/cli/preflightLive.ts",
    "--project",
    project,
    "--agent",
    "sdd-apply",
    "--task",
    "PowerShell && memoria #152 comando corregido",
    "--action",
    "shell",
    "--shell",
    "powershell",
    "--cwd",
    REPO_ROOT,
    "--base-url",
    baseUrl,
  ];
  const result = await runProcess(process.execPath, args);
  let outcome = "unknown";
  let corrected: string | null = null;
  let traceId: string | null = null;
  let consulted: number[] = [];
  try {
    const parsed = JSON.parse(result.stdout) as {
      consulted_ids?: number[];
      enforcement?: { outcome?: string; corrected_command?: string; trace_id?: string };
    };
    outcome = parsed.enforcement?.outcome ?? "unknown";
    corrected = parsed.enforcement?.corrected_command ?? null;
    traceId = parsed.enforcement?.trace_id ?? null;
    consulted = parsed.consulted_ids ?? [];
  } catch {
    // If the CLI did not produce parseable JSON, fall through with
    // the raw stdout in the detail.
  }
  const accept =
    outcome === "correct" &&
    corrected === "cmd1; if ($?) { cmd2 }" &&
    consulted.includes(152) &&
    result.exitCode === 4;
  return {
    ran: true,
    pass: accept,
    exit_code: result.exitCode,
    outcome,
    corrected_command: corrected,
    trace_id: traceId,
    consulted_ids: consulted,
    detail: accept
      ? "live P0 closure: PowerShell && -> Engram #152 -> cmd1; if ($?) { cmd2 } (exit 4)"
      : `live P0 smoke did NOT pass: outcome=${outcome} corrected=${corrected} consulted=${consulted.join(",")} exit=${result.exitCode}`,
    stdout_tail: tail(result.stdout, 1200),
    stderr_tail: tail(result.stderr, 600),
  };
}

interface CliArgs {
  json: boolean;
  reportPath: string;
  skipLive: boolean;
  skipTypecheck: boolean;
  skipVitest: boolean;
  skipGuardrails: boolean;
  skipMcpSmoke: boolean;
}

function parseCliArgs(argv: string[]): CliArgs {
  const result: CliArgs = {
    json: false,
    reportPath: VERIFY_REPORT,
    skipLive: false,
    skipTypecheck: false,
    skipVitest: false,
    skipGuardrails: false,
    skipMcpSmoke: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    switch (arg) {
      case "--json":
        result.json = true;
        break;
      case "--report":
      case "--report-path": {
        const value = argv[i + 1];
        if (value === undefined || value.startsWith("--")) {
          throw new Error(`Missing value for ${arg}`);
        }
        result.reportPath = value;
        i += 1;
        break;
      }
      case "--skip-live":
        result.skipLive = true;
        break;
      case "--skip-typecheck":
        result.skipTypecheck = true;
        break;
      case "--skip-vitest":
        result.skipVitest = true;
        break;
      case "--skip-guardrails":
        result.skipGuardrails = true;
        break;
      case "--skip-mcp-smoke":
        result.skipMcpSmoke = true;
        break;
      case "--help":
      case "-h":
        throw new Error(
          "Usage: engram-rag verify:all [--json] [--report <path>] " +
            "[--skip-live] [--skip-typecheck] [--skip-vitest] " +
            "[--skip-guardrails] [--skip-mcp-smoke]",
        );
      default:
        if (!arg.startsWith("--")) {
          throw new Error(`Unexpected positional argument: ${arg}`);
        }
        throw new Error(`Unknown flag: ${arg}`);
    }
  }
  return result;
}

function formatHumanReport(report: VerifyAllReport): string {
  const lines: string[] = [];
  lines.push(`[verify:all] exit=${report.exit_code} ` +
    `passed=${report.summary.passed} failed=${report.summary.failed} total=${report.summary.total} ` +
    `live_p0=${report.live_p0_smoke_run ? (report.live_p0_smoke?.pass ? "PASS" : "FAIL") : "skipped"} ` +
    `report=${VERIFY_REPORT}`,
  );
  for (const check of report.checks) {
    lines.push(
      `  [${check.pass ? "PASS" : "FAIL"}] ${check.id} exit=${check.exit_code} ` +
        `duration=${check.duration_ms}ms ${check.description}`,
    );
  }
  if (report.live_p0_smoke !== null && report.live_p0_smoke.ran) {
    lines.push(
      `  live P0: outcome=${report.live_p0_smoke.outcome} ` +
        `corrected=${report.live_p0_smoke.corrected_command ?? "—"} ` +
        `consulted=${report.live_p0_smoke.consulted_ids.join(",")} ` +
        `trace=${report.live_p0_smoke.trace_id ?? "—"}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

/**
 * The library entry point used by tests. It runs every check
 * sequentially and returns the unified report. No side effects
 * beyond writing `reportPath` when the caller provides one.
 */
export async function runVerifyAll(
  options: Partial<CliArgs> = {},
): Promise<VerifyAllReport> {
  const startedAt = new Date().toISOString();
  const checks: CheckResult[] = [];
  const reportPath = options.reportPath ?? VERIFY_REPORT;
  const skipVitest = options.skipVitest === true;
  const skipGuardrails = options.skipGuardrails === true;
  const skipTypecheck = options.skipTypecheck === true;
  const skipMcpSmoke = options.skipMcpSmoke === true;
  const skipLive = options.skipLive === true;

  if (!skipVitest) {
    checks.push(await runVitest(FOCUSED_TEST_FILES));
  }
  if (!skipGuardrails) {
    checks.push(await runGuardrailTests());
  }
  if (!skipTypecheck) {
    checks.push(await runTypecheck());
  }
  let mcpSmokeReport: ReturnType<typeof runMcpSmoke> | null = null;
  if (!skipMcpSmoke) {
    const mcpResult = await runMcpSmokeCheck();
    checks.push(mcpResult.check);
    mcpSmokeReport = mcpResult.report;
  }
  const liveP0 = skipLive
    ? {
        ran: false,
        pass: true,
        exit_code: 0,
        outcome: "skipped",
        corrected_command: null,
        trace_id: null,
        consulted_ids: [],
        detail: "live P0 smoke skipped via --skip-live",
        stdout_tail: "",
        stderr_tail: "",
      }
    : await runLiveP0Smoke();

  // The live P0 smoke is OPTIONAL in CI. We do NOT fail the unified
  // gate on it: the focused tests already pin the engine. But we DO
  // include it in the report so a future audit can see whether the
  // operator actually exercised the live path.
  const failed = checks.filter((c) => !c.pass);
  const exitCode = failed.length === 0 ? 0 : 2;
  const finishedAt = new Date().toISOString();

  const report: VerifyAllReport = {
    command: "verify:all",
    started_at: startedAt,
    finished_at: finishedAt,
    exit_code: exitCode,
    checks,
    focused_files: [...FOCUSED_TEST_FILES],
    guardrail_files: [...GUARDRAIL_TEST_FILES],
    live_p0_smoke_run: liveP0.ran,
    live_p0_smoke: liveP0,
    mcp_smoke: mcpSmokeReport,
    summary: {
      passed: checks.length - failed.length,
      failed: failed.length,
      total: checks.length,
    },
  };

  try {
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  } catch {
    // The report is a best-effort artifact; a write failure must not
    // mask the actual gate result. The caller can still read the
    // return value.
  }
  return report;
}

export async function runVerifyAllCli(argv: string[]): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  let args: CliArgs;
  try {
    args = parseCliArgs(argv);
  } catch (err) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `${(err as Error).message}\n`,
    };
  }
  try {
    const report = await runVerifyAll(args);
    const stdout = args.json
      ? `${JSON.stringify(report, null, 2)}\n`
      : formatHumanReport(report);
    return { exitCode: report.exit_code, stdout, stderr: "" };
  } catch (err) {
    return {
      exitCode: 3,
      stdout: "",
      stderr: `${(err as Error).message}\n`,
    };
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === fileURLToPath(`file://${process.argv[1]}`);

if (invokedDirectly) {
  runVerifyAllCli(process.argv.slice(2)).then((result) => {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    process.exit(result.exitCode);
  });
}

// Avoid a "value never read" warning when the report path is unused.
void FOCUSED_REPORT;
void existsSync;
void readFileSync;
