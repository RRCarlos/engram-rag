import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { parseKnowledgeRecord } from "../contracts/knowledgeRecord.js";
import type { RetrievalRequest } from "../contracts/retrieval.js";
import { createFakeAdapter } from "../engram/fakeEngramAdapter.js";
import { runPreflight } from "../engram/runPreflight.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..", "..");
const REPORT_PATH = resolve(REPO_ROOT, "reports/phase2/verify-report.json");

const ARTIFACTS = [
  "src/engram/EngramTools.ts",
  "src/engram/fakeEngramAdapter.ts",
  "src/engram/runPreflight.ts",
  "src/cli/preflight.ts",
  "src/cli/verifyPhase2.ts",
  "test/engram/EngramTools.test.ts",
  "test/engram/fakeEngramAdapter.test.ts",
  "test/engram/runPreflight.test.ts",
  "test/cli/preflight.test.ts",
  "test/cli/verifyPhase2.test.ts",
  "test/guardrails/noLiveMcpInTests.test.ts",
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
    latency_ms_p95: number;
    degraded_supported: boolean;
  };
}

function parseVitestJson(raw: string): VitestJson {
  let parsed: VitestJson = {};
  for (const line of raw.trim().split(/\r?\n/)) {
    try {
      const candidate = JSON.parse(line) as VitestJson;
      if (typeof candidate.numPassedTests === "number") {
        parsed = candidate;
      }
    } catch {
      // Vitest may print non-JSON lines before/after the summary.
    }
  }
  return parsed;
}

function fixture(name: string) {
  const path = resolve(REPO_ROOT, "fixtures", "knowledge", name);
  return parseKnowledgeRecord(JSON.parse(readFileSync(path, "utf8")));
}

function p95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[index] ?? 0;
}

async function measurePreflightMetrics(): Promise<{
  latency_ms_p95: number;
  degraded_supported: boolean;
}> {
  const request: RetrievalRequest = {
    project: "engram-rag",
    agent_id: "sdd-apply",
    task_text: "Run npm install in PowerShell without using &&.",
    action_kind: "shell",
    shell: "powershell",
  };
  const latencies: number[] = [];
  for (let i = 0; i < 5; i += 1) {
    const started = performance.now();
    await runPreflight(
      request,
      createFakeAdapter([fixture("powershell-and.json")], { latencyMs: 1 }),
    );
    latencies.push(performance.now() - started);
  }
  const degraded = await runPreflight(
    request,
    createFakeAdapter([fixture("powershell-and.json")], {
      failureMode: "throw",
      failOn: ["mem_search"],
    }),
  );
  return { latency_ms_p95: p95(latencies), degraded_supported: degraded.degraded === true };
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const command = "npm test -- --reporter=json";
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
    const parsed = parseVitestJson(raw);
    totalTests = parsed.numTotalTests ?? 0;
    testsPassed = parsed.numPassedTests ?? 0;
    testsFailed = parsed.numFailedTests ?? 0;
    if (parsed.success === false) exitCode = 1;
  } catch (error) {
    const err = error as { status?: number | null; stdout?: string };
    exitCode = err.status ?? 1;
    const parsed = parseVitestJson(err.stdout ?? "");
    totalTests = parsed.numTotalTests ?? 0;
    testsPassed = parsed.numPassedTests ?? 0;
    testsFailed = parsed.numFailedTests ?? 0;
  }

  const artifactsMissing = ARTIFACTS.filter((rel) => !existsSync(resolve(REPO_ROOT, rel)));
  const metrics = await measurePreflightMetrics();
  if (artifactsMissing.length > 0 || metrics.latency_ms_p95 > 2000 || !metrics.degraded_supported) {
    exitCode = 1;
  }

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
      ...metrics,
    },
  };

  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");
  process.stdout.write(
    `[verify:phase2] exit=${exitCode} passed=${testsPassed} failed=${testsFailed} ` +
      `latency_ms_p95=${metrics.latency_ms_p95.toFixed(2)} degraded_supported=${String(metrics.degraded_supported)} ` +
      `report=${REPORT_PATH}\n`,
  );
  process.exit(exitCode);
}

void main();
