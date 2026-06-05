/**
 * Phase 4 — `eval` CLI.
 *
 * Loads every scenario, runs each through the runner, and
 * writes the aggregate `EvalReport` to
 * `reports/phase4/eval-report.json`. Exits 0 if every
 * scenario passed, 1 if any failed. Designed to be driven
 * by `verify:phase4` (PR-C) as a sub-step.
 *
 * CLI shape mirrors the rest of the v2 CLIs:
 *   node --import tsx src/cli/eval.ts [--cwd <repo>]
 *
 * `--cwd` defaults to `process.cwd()`. The script always
 * resolves scenarios and fixtures relative to the script's
 * own location, not the cwd, so the report is reproducible
 * regardless of where it is invoked from.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname } from "node:path";
import { loadAllScenarios } from "../eval/suites.js";
import { runScenario, type EvalAdapterKind, type RunScenarioOptions } from "../eval/runScenario.js";
import type { EvalReport, Score } from "../eval/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..", "..");
const REPORT_DIR = resolve(REPO_ROOT, "reports", "phase4");
const REPORT_PATH = resolve(REPORT_DIR, "eval-report.json");
const CANONICAL_TOPIC_KEY = "engram-rag/agent-rigor-protocol/v2";

export interface EvalCliOptions {
  cwd?: string;
  command?: string;
  startedAt?: Date;
  argv?: string[];
  tools?: RunScenarioOptions["tools"];
}

export interface EvalCliResult {
  exitCode: number;
  report: EvalReport;
  stdout: string;
  stderr: string;
}

function p95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(0.95 * sorted.length) - 1;
  const index = Math.max(0, Math.min(rank, sorted.length - 1));
  return sorted[index];
}

function buildReport(
  suite: string,
  adapter: "fake" | "live",
  scores: Score[],
  startedAt: Date,
  finishedAt: Date,
  command: string,
): EvalReport {
  const total = scores.length;
  const passed = scores.filter((s) => s.pass).length;
  const failed = total - passed;
  const top1 = total === 0 ? 0 : scores.reduce((acc, s) => acc + s.top_k_hit_rate.k1, 0) / total;
  const top3 = total === 0 ? 0 : scores.reduce((acc, s) => acc + s.top_k_hit_rate.k3, 0) / total;
  const latencies = scores.map((s) => s.latency_ms);
  const degradedCount = scores.filter((s) => s.degraded).length;

  return {
    command,
    exit_code: failed === 0 ? 0 : 1,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    suite,
    adapter,
    scenarios_total: total,
    scenarios_passed: passed,
    scenarios_failed: failed,
    metrics: {
      top1_hit_rate: top1,
      top3_hit_rate: top3,
      p95_latency_ms: p95(latencies),
      degraded_count: degradedCount,
      canonical_topic_key: CANONICAL_TOPIC_KEY,
    },
    scores,
  };
}

function formatSummary(report: EvalReport): string {
  const lines: string[] = [];
  lines.push(`Phase 4 eval — suite: ${report.suite} (${report.adapter} adapter)`);
  lines.push(
    `scenarios: ${report.scenarios_total}  passed: ${report.scenarios_passed}  failed: ${report.scenarios_failed}`,
  );
  lines.push(
    `metrics: top1=${report.metrics.top1_hit_rate.toFixed(3)}  top3=${report.metrics.top3_hit_rate.toFixed(3)}  p95_latency_ms=${report.metrics.p95_latency_ms.toFixed(1)}  degraded=${report.metrics.degraded_count}`,
  );
  for (const score of report.scores) {
    const status = score.pass ? "PASS" : "FAIL";
    const reason = score.pass
      ? ""
      : `  -- top3=${score.top_k_hit_rate.k3.toFixed(2)}` +
        (score.missing_expected_rules.length > 0
          ? ` missing_rules=${score.missing_expected_rules.length}`
          : "") +
        (score.latency_breached ? " latency_breach" : "") +
        (score.degraded ? " degraded" : "");
    lines.push(`  [${status}] ${score.scenario_id} latency_ms=${score.latency_ms.toFixed(1)}${reason}`);
  }
  lines.push(`report: ${REPORT_PATH}`);
  return lines.join("\n");
}

function parseArgs(argv: string[]): { adapter: EvalAdapterKind; baseUrl: string } {
  let adapter: EvalAdapterKind = "fake";
  let baseUrl = "http://127.0.0.1:7437";

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--adapter") {
      const value = argv[i + 1];
      if (value !== "fake" && value !== "live") {
        throw new Error("--adapter must be either fake or live");
      }
      adapter = value;
      i += 1;
      continue;
    }
    if (arg === "--base-url") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error("Missing value for --base-url");
      }
      baseUrl = value;
      i += 1;
      continue;
    }
    if (arg === "--cwd") {
      i += 1;
      continue;
    }
    throw new Error(`Unknown flag: ${arg}`);
  }

  return { adapter, baseUrl };
}

export async function runEvalCli(options: EvalCliOptions = {}): Promise<EvalCliResult> {
  const command = options.command ?? "node --import tsx src/cli/eval.ts";
  const startedAt = options.startedAt ?? new Date();
  const parsed = parseArgs(options.argv ?? []);
  const scenarios = loadAllScenarios();
  const scores: Score[] = [];
  for (const scenario of scenarios) {
    scores.push(
      await runScenario(scenario, {
        adapter: parsed.adapter,
        baseUrl: parsed.baseUrl,
        tools: options.tools,
      }),
    );
  }
  const finishedAt = new Date();
  const report = buildReport("phase4-default", parsed.adapter, scores, startedAt, finishedAt, command);
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
  const stdout = formatSummary(report);
  return {
    exitCode: report.exit_code,
    report,
    stdout,
    stderr: "",
  };
}

// Run when invoked directly. We compare the entry script's
// path via `pathToFileURL` (the platform-correct way) to
// `import.meta.url`. Hand-rolled `file:///${...}` does not
// match on POSIX (the leading slash in absolute paths is
// doubled), so we always use `pathToFileURL`.
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  runEvalCli({ cwd: process.cwd(), argv: process.argv.slice(2) })
    .then((result) => {
      console.log(result.stdout);
      if (result.stderr) {
        console.error(result.stderr);
      }
      process.exit(result.exitCode);
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      console.error(message);
      process.exit(1);
    });
}
