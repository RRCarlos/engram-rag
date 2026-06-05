import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const REPO_ROOT = resolve(__dirname, "..", "..");
const REPORT_PATH = resolve(REPO_ROOT, "reports/phase4/verify-report.json");

/**
 * Schema for the Phase 4 verify report. Adds the per-gate array
 * and the eval-report cross-reference on top of the eval report
 * schema.
 */
const GateSchema = z.object({
  id: z.string(),
  description: z.string(),
  pass: z.boolean(),
  detail: z.string(),
});

const ReportSchema = z.object({
  command: z.string(),
  exit_code: z.number(),
  started_at: z.string().datetime(),
  finished_at: z.string().datetime(),
  tests_passed: z.number().nonnegative(),
  tests_failed: z.number().nonnegative(),
  artifacts_checked: z.array(z.string()).min(1),
  metrics: z.object({
    total_tests: z.number().nonnegative(),
    artifacts_missing: z.array(z.string()),
    canonical_topic_key: z.string(),
    scenarios_total: z.number().nonnegative(),
    scenarios_passed: z.number().nonnegative(),
    top3_hit_rate: z.number().min(0).max(1),
  }),
  gates: z.array(GateSchema).length(5),
  eval_report_path: z.string().min(1),
});

function runVerify(): { stdout: string; status: number } {
  try {
    const stdout = execFileSync("node", ["--import", "tsx", "src/cli/verifyPhase4.ts"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120_000,
    });
    return { stdout, status: 0 };
  } catch (error) {
    const err = error as { status?: number; stdout?: string };
    return { stdout: err.stdout ?? "", status: err.status ?? 1 };
  }
}

describe("verifyPhase4 CLI", () => {
  if (existsSync(REPORT_PATH)) {
    rmSync(REPORT_PATH, { force: true });
  }

  it("writes reports/phase4/verify-report.json with the Phase 4 schema", () => {
    const { status } = runVerify();
    expect(status).toBe(0);
    expect(existsSync(REPORT_PATH)).toBe(true);

    const raw = readFileSync(REPORT_PATH, "utf8");
    const parsed = ReportSchema.parse(JSON.parse(raw));
    expect(parsed.command).toMatch(/verify/i);
    expect(parsed.tests_failed).toBe(0);
    expect(parsed.metrics.canonical_topic_key).toBe(
      "engram-rag/agent-rigor-protocol/v2",
    );
  });

  it("lists every Phase 4 artifact as checked and reports zero missing", () => {
    runVerify();
    const raw = readFileSync(REPORT_PATH, "utf8");
    const parsed = ReportSchema.parse(JSON.parse(raw));
    expect(parsed.metrics.artifacts_missing).toEqual([]);
    expect(parsed.artifacts_checked).toContain("src/eval/types.ts");
    expect(parsed.artifacts_checked).toContain("src/eval/score.ts");
    expect(parsed.artifacts_checked).toContain("src/eval/suites.ts");
    expect(parsed.artifacts_checked).toContain("src/eval/runScenario.ts");
    expect(parsed.artifacts_checked).toContain("src/cli/eval.ts");
    expect(parsed.artifacts_checked).toContain("src/cli/verifyPhase4.ts");
  });

  it("reports all five gates passing on a clean run", () => {
    runVerify();
    const raw = readFileSync(REPORT_PATH, "utf8");
    const parsed = ReportSchema.parse(JSON.parse(raw));
    const ids = parsed.gates.map((g) => g.id);
    expect(ids).toEqual(["G1", "G2", "G3", "G4", "G5"]);
    for (const gate of parsed.gates) {
      expect(gate.pass).toBe(true);
    }
  });

  it("scenarios_total and scenarios_passed match the live fixture count", () => {
    runVerify();
    const raw = readFileSync(REPORT_PATH, "utf8");
    const parsed = ReportSchema.parse(JSON.parse(raw));
    expect(parsed.metrics.scenarios_total).toBeGreaterThanOrEqual(5);
    expect(parsed.metrics.scenarios_passed).toBe(parsed.metrics.scenarios_total);
  });

  it("top3_hit_rate is at least 0.6 on a clean run", () => {
    runVerify();
    const raw = readFileSync(REPORT_PATH, "utf8");
    const parsed = ReportSchema.parse(JSON.parse(raw));
    expect(parsed.metrics.top3_hit_rate).toBeGreaterThanOrEqual(0.6);
  });
});
