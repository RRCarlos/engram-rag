import { existsSync, readFileSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { z } from "zod";
import { beforeEach, describe, expect, it } from "vitest";

const REPORT_PATH = resolve(process.cwd(), "reports/phase2/verify-report.json");

const ReportSchema = z.object({
  command: z.string(),
  exit_code: z.number(),
  started_at: z.string().datetime(),
  finished_at: z.string().datetime(),
  tests_passed: z.number(),
  tests_failed: z.number(),
  artifacts_checked: z.array(z.string()),
  metrics: z.object({
    total_tests: z.number(),
    artifacts_missing: z.array(z.string()),
    canonical_topic_key: z.literal("engram-rag/agent-rigor-protocol/v2"),
    latency_ms_p95: z.number().max(2000),
    degraded_supported: z.literal(true),
  }),
});

beforeEach(() => {
  rmSync(REPORT_PATH, { force: true });
});

function runVerifyPhase2() {
  try {
    const stdout = execSync("npm run verify:phase2", {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stdout };
  } catch (error) {
    const err = error as { status?: number | null; stdout?: string };
    return { status: err.status ?? 1, stdout: err.stdout ?? "" };
  }
}

describe("verifyPhase2 CLI", () => {
  it("writes reports/phase2/verify-report.json with Phase 2 metrics", () => {
    const result = runVerifyPhase2();

    expect(result.status).toBe(0);
    expect(existsSync(REPORT_PATH)).toBe(true);

    const report = ReportSchema.parse(JSON.parse(readFileSync(REPORT_PATH, "utf8")));
    expect(report.exit_code).toBe(0);
    expect(report.tests_passed).toBeGreaterThan(0);
    expect(report.tests_failed).toBe(0);
    expect(report.metrics.artifacts_missing).toEqual([]);
    expect(report.metrics.latency_ms_p95).toBeGreaterThan(0);
    expect(report.artifacts_checked).toContain("src/engram/runPreflight.ts");
  });
});
