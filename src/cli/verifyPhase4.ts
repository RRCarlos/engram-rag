/**
 * Phase 4 verify script.
 *
 * Closes Phase 4 with five acceptance gates (G1-G5) from
 * `rag-system/v2/design.md` §6:
 *
 *   G1. ≥ 5 scenarios pass against the fake adapter.
 *   G2. Aggregate `top3_hit_rate >= 0.6` across the suite.
 *   G3. Every scenario's `expected_record_topic_keys` resolves
 *       to a real knowledge fixture.
 *   G4. No forbidden v1 topic alias appears in any scenario
 *       or in the eval report (the guardrail test covers the
 *       source tree; this script covers the runtime artifacts).
 *   G5. The eval report carries the canonical protocol topic
 *       key in its metrics block.
 *
 * The script runs `npm run eval` (Phase 4's runtime CLI) and
 * re-reads the report it writes. The verify report itself
 * is written to `reports/phase4/verify-report.json` with a
 * superset of the eval report fields plus the per-gate
 * boolean.
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EvalReportSchema } from "../eval/types.js";
import { FORBIDDEN_TOPIC_ALIASES } from "../contracts/topicKeys.js";
import { CANONICAL_PROTOCOL_TOPIC_KEY } from "../contracts/topicKeys.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..", "..");
const VERIFY_REPORT_PATH = resolve(REPO_ROOT, "reports/phase4/verify-report.json");
const EVAL_REPORT_PATH = resolve(REPO_ROOT, "reports/phase4/eval-report.json");
const ARTIFACTS = [
  "src/eval/types.ts",
  "src/eval/score.ts",
  "src/eval/suites.ts",
  "src/eval/runScenario.ts",
  "src/cli/eval.ts",
  "src/cli/verifyPhase4.ts",
  "test/eval/score.test.ts",
  "test/eval/suites.test.ts",
  "test/eval/runScenario.test.ts",
  "test/cli/eval.test.ts",
  "eval/scenarios/powershell-and.json",
  "eval/scenarios/sdd-spec-gherkin.json",
  "eval/scenarios/shell-unknown-shell.json",
  "eval/scenarios/convention-skill-frontmatter.json",
  "eval/scenarios/spec-gherkin-with-extra-noise.json",
];

interface Gate {
  id: string;
  description: string;
  pass: boolean;
  detail: string;
}

interface VerifyReport {
  command: string;
  exit_code: number;
  started_at: string;
  finished_at: string;
  tests_passed: number;
  tests_failed: number;
  artifacts_checked: string[];
  metrics: {
    total_tests: number;
    artifacts_missing: string[];
    canonical_topic_key: string;
    scenarios_total: number;
    scenarios_passed: number;
    top3_hit_rate: number;
  };
  gates: Gate[];
  eval_report_path: string;
}

function runEvalAndReadReport(): {
  report: ReturnType<typeof EvalReportSchema.parse>;
  evalExitCode: number;
} {
  let evalExitCode = 0;
  let stdout = "";
  try {
    stdout = execSync("node --import tsx src/cli/eval.ts", {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    const error = err as { status?: number | null; stdout?: string };
    evalExitCode = error.status ?? 1;
    stdout = error.stdout ?? "";
  }
  void stdout;
  const raw = readFileSync(EVAL_REPORT_PATH, "utf8");
  const report = EvalReportSchema.parse(JSON.parse(raw));
  return { report, evalExitCode };
}

function forbiddenAliasInEvalReport(): string[] {
  if (!existsSync(EVAL_REPORT_PATH)) return [];
  const raw = readFileSync(EVAL_REPORT_PATH, "utf8");
  return FORBIDDEN_TOPIC_ALIASES.filter((alias) => raw.includes(alias));
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const command = "npm test -- --reporter=json && verify:phase4 (runEvalAndReadReport)";

  let exitCode = 0;
  let testsPassed = 0;
  let testsFailed = 0;
  let totalTests = 0;

  try {
    const raw = execSync(
      "npx vitest run --reporter=json --exclude \"test/cli/verifyPhase*.test.ts\"",
      {
        cwd: REPO_ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const lines = raw.trim().split(/\r?\n/);
    let parsed: {
      numPassedTests?: number;
      numFailedTests?: number;
      numTotalTests?: number;
      success?: boolean;
    } = {};
    for (const line of lines) {
      try {
        const candidate = JSON.parse(line) as typeof parsed;
        if (typeof candidate.numPassedTests === "number") {
          parsed = candidate;
        }
      } catch {
        // skip non-JSON status lines
      }
    }
    totalTests = parsed.numTotalTests ?? 0;
    testsPassed = parsed.numPassedTests ?? 0;
    testsFailed = parsed.numFailedTests ?? 0;
    if (parsed.success === false) exitCode = 1;
  } catch (err) {
    const error = err as { status?: number | null; stdout?: string };
    exitCode = error.status ?? 1;
    const lines = (error.stdout ?? "").trim().split(/\r?\n/);
    let parsed: {
      numPassedTests?: number;
      numFailedTests?: number;
      numTotalTests?: number;
    } = {};
    for (const line of lines) {
      try {
        const candidate = JSON.parse(line) as typeof parsed;
        if (typeof candidate.numPassedTests === "number") {
          parsed = candidate;
        }
      } catch {
        // skip
      }
    }
    totalTests = parsed.numTotalTests ?? 0;
    testsPassed = parsed.numPassedTests ?? 0;
    testsFailed = parsed.numFailedTests ?? 0;
  }

  const artifactsMissing = ARTIFACTS.filter(
    (rel) => !existsSync(resolve(REPO_ROOT, rel)),
  );
  if (artifactsMissing.length > 0) exitCode = 1;

  let evalReport: ReturnType<typeof EvalReportSchema.parse> | null = null;
  let evalExitCode = 0;
  try {
    const result = runEvalAndReadReport();
    evalReport = result.report;
    evalExitCode = result.evalExitCode;
  } catch (err) {
    exitCode = 1;
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[verify:phase4] eval step failed: ${message}\n`);
  }

  const gates: Gate[] = [];
  const forbidden = forbiddenAliasInEvalReport();

  if (evalReport) {
    gates.push({
      id: "G1",
      description: "≥ 5 scenarios pass against the fake adapter",
      pass: evalReport.scenarios_total >= 5 && evalReport.scenarios_failed === 0,
      detail: `scenarios_total=${evalReport.scenarios_total} scenarios_passed=${evalReport.scenarios_passed} scenarios_failed=${evalReport.scenarios_failed}`,
    });
    gates.push({
      id: "G2",
      description: "aggregate top3_hit_rate >= 0.6",
      pass: evalReport.metrics.top3_hit_rate >= 0.6,
      detail: `top3_hit_rate=${evalReport.metrics.top3_hit_rate.toFixed(3)}`,
    });
    gates.push({
      id: "G3",
      description: "every expected record topic key resolves to a real fixture",
      pass: evalReport.scores.every((s) => s.missing_expected_records.length === 0),
      detail: `scores_with_missing_records=${evalReport.scores.filter((s) => s.missing_expected_records.length > 0).length}`,
    });
    gates.push({
      id: "G4",
      description: "no forbidden v1 topic alias in the eval report",
      pass: forbidden.length === 0,
      detail:
        forbidden.length === 0
          ? "no forbidden alias found"
          : `forbidden aliases present: ${forbidden.join(", ")}`,
    });
    gates.push({
      id: "G5",
      description: "the eval report carries the canonical protocol topic key",
      pass: evalReport.metrics.canonical_topic_key === CANONICAL_PROTOCOL_TOPIC_KEY,
      detail: `canonical_topic_key=${evalReport.metrics.canonical_topic_key}`,
    });
  } else {
    for (const id of ["G1", "G2", "G3", "G4", "G5"]) {
      gates.push({
        id,
        description: "(eval report missing; gate not evaluated)",
        pass: false,
        detail: "eval-report.json absent or unparseable",
      });
    }
  }

  if (gates.some((g) => !g.pass) || evalExitCode !== 0) exitCode = 1;

  const report: VerifyReport = {
    command,
    exit_code: exitCode,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    tests_passed: testsPassed,
    tests_failed: testsFailed,
    artifacts_checked: ARTIFACTS,
    metrics: {
      total_tests: totalTests,
      artifacts_missing: artifactsMissing,
      canonical_topic_key: CANONICAL_PROTOCOL_TOPIC_KEY,
      scenarios_total: evalReport?.scenarios_total ?? 0,
      scenarios_passed: evalReport?.scenarios_passed ?? 0,
      top3_hit_rate: evalReport?.metrics.top3_hit_rate ?? 0,
    },
    gates,
    eval_report_path: EVAL_REPORT_PATH,
  };

  mkdirSync(dirname(VERIFY_REPORT_PATH), { recursive: true });
  writeFileSync(VERIFY_REPORT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");

  const gateSummary = gates
    .map((g) => `[${g.pass ? "PASS" : "FAIL"}] ${g.id}`)
    .join(" ");
  process.stdout.write(
    `[verify:phase4] exit=${exitCode} passed=${testsPassed} failed=${testsFailed} ` +
      `artifacts_missing=${artifactsMissing.length} ` +
      `gates=${gateSummary} report=${VERIFY_REPORT_PATH}\n`,
  );

  process.exit(exitCode);
}

void main();
