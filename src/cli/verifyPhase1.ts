/**
 * Phase 1 verify script.
 *
 * Runs the test suite, then writes
 * `reports/phase1/verify-report.json` with the schema defined in
 * `rag-system/v2/design.md` §8:
 *
 *   command: string
 *   exit_code: number
 *   started_at: string
 *   finished_at: string
 *   tests_passed: number
 *   tests_failed: number
 *   artifacts_checked: string[]
 *   metrics: object
 *
 * Exit code is 0 only when all tests pass AND the report was written.
 * The script never short-circuits: even on a test failure the report
 * is written so reviewers can see the gap.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..", "..");

const REPORT_PATH = resolve(REPO_ROOT, "reports/phase1/verify-report.json");

const ARTIFACTS = [
  "package.json",
  "tsconfig.json",
  "vitest.config.ts",
  "src/contracts/topicKeys.ts",
  "src/contracts/knowledgeRecord.ts",
  "src/contracts/retrieval.ts",
  "src/retrieval/retrievalPlan.ts",
  "fixtures/knowledge/powershell-and.json",
  "fixtures/knowledge/sdd-spec-gherkin.json",
  "docs/evidence/v1-forensics.md",
  "test/smoke.test.ts",
  "test/guardrails/noLegacyTopicKeys.test.ts",
  "test/ci/workflow.test.ts",
  ".github/workflows/ci.yml",
];

interface VitestJson {
  numPassedTests?: number;
  numFailedTests?: number;
  numTotalTests?: number;
  success?: boolean;
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
  };
}

function main(): void {
  const startedAt = new Date().toISOString();
  const command = "npm test -- --reporter=json";

  let exitCode = 0;
  let testsPassed = 0;
  let testsFailed = 0;
  let totalTests = 0;

  try {
    // On Windows the child shell needs `cmd.exe /c` to spawn `npx`
    // reliably when this script is itself called from a `bash`-via-
    // PowerShell context. The CLI test that calls this script does
    // not use bash, but the documented orchestrator does, so the
    // wrapper keeps the behavior consistent across invocation
    // surfaces.
    const raw = execFileSync(
      "cmd.exe",
      [
        "/c",
        "npx vitest run --reporter=json --exclude test/cli/verifyPhase1.test.ts",
      ],
      {
        cwd: REPO_ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    // vitest's JSON reporter prints one or more JSON objects. The
    // final summary is the last line.
    const lines = raw.trim().split(/\r?\n/);
    let parsed: VitestJson = {};
    for (const line of lines) {
      try {
        const candidate = JSON.parse(line) as VitestJson;
        if (typeof candidate.numPassedTests === "number") {
          parsed = candidate;
        }
      } catch {
        // not JSON, ignore (e.g. status line)
      }
    }
    totalTests = parsed.numTotalTests ?? 0;
    testsPassed = parsed.numPassedTests ?? 0;
    testsFailed = parsed.numFailedTests ?? 0;
    if (parsed.success === false) {
      exitCode = 1;
    }
  } catch (error) {
    const err = error as { status?: number | null; stdout?: string; stderr?: string };
    exitCode = err.status ?? 1;
    const stdout = err.stdout ?? "";
    const lines = stdout.trim().split(/\r?\n/);
    for (const line of lines) {
      try {
        const candidate = JSON.parse(line) as VitestJson;
        if (typeof candidate.numPassedTests === "number") {
          totalTests = candidate.numTotalTests ?? 0;
          testsPassed = candidate.numPassedTests ?? 0;
          testsFailed = candidate.numFailedTests ?? 0;
        }
      } catch {
        // ignore
      }
    }
  }

  const artifactsMissing = ARTIFACTS.filter(
    (rel) => !existsSync(resolve(REPO_ROOT, rel)),
  );

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
      canonical_topic_key: "engram-rag/agent-rigor-protocol/v2",
    },
  };

  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");

  // Print a one-line summary so CI logs are easy to scan.
  process.stdout.write(
    `[verify:phase1] exit=${exitCode} passed=${testsPassed} failed=${testsFailed} ` +
      `artifacts_missing=${artifactsMissing.length} report=${REPORT_PATH}\n`,
  );

  process.exit(exitCode);
}

main();
