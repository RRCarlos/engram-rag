import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const REPO_ROOT = resolve(__dirname, "..", "..");
const REPORT_PATH = resolve(REPO_ROOT, "reports/phase3/verify-report.json");

/**
 * Schema for the Phase 3 verify report. Phase 3 adds two top-level
 * sections on top of the Phase 1/2 base: a per-fixture check array
 * and two new metrics (`dry_run_idempotent` and a per-fixture pass
 * tally). The report's `metrics` block is the structural anchor for
 * the closure contract.
 */
const FixtureCheckSchema = z.object({
  file: z.string(),
  expected_pass: z.boolean(),
  actual_pass: z.boolean().nullable(),
  agent_id: z.string().nullable(),
  reason: z.string(),
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
    fixtures_total: z.number().nonnegative(),
    fixtures_expected_pass: z.number().nonnegative(),
    fixtures_actual_pass: z.number().nonnegative(),
    dry_run_idempotent: z.boolean(),
    dry_run_note: z.string(),
  }),
  fixtures: z.array(FixtureCheckSchema),
});

function runVerify(): { stdout: string; status: number } {
  try {
    const stdout = execFileSync(
      "node",
      ["--import", "tsx", "src/cli/verifyPhase3.ts"],
      {
        cwd: REPO_ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 120_000,
      },
    );
    return { stdout, status: 0 };
  } catch (error) {
    const err = error as { status?: number; stdout?: string };
    return { stdout: err.stdout ?? "", status: err.status ?? 1 };
  }
}

describe("verifyPhase3 CLI", () => {
  it("writes reports/phase3/verify-report.json with the Phase 3 schema", () => {
    if (existsSync(REPORT_PATH)) {
      rmSync(REPORT_PATH, { force: true });
    }
    const { status } = runVerify();
    expect(status).toBe(0);
    expect(existsSync(REPORT_PATH)).toBe(true);

    const raw = readFileSync(REPORT_PATH, "utf8");
    const parsed = ReportSchema.parse(JSON.parse(raw));
    expect(parsed.command).toMatch(/npm test/i);
    expect(parsed.tests_passed).toBeGreaterThan(0);
    expect(parsed.tests_failed).toBe(0);
    expect(parsed.metrics.canonical_topic_key).toBe(
      "engram-rag/agent-rigor-protocol/v2",
    );
  });

  it("lists every Phase 3 artifact as checked and reports zero missing", () => {
    runVerify();
    const raw = readFileSync(REPORT_PATH, "utf8");
    const parsed = ReportSchema.parse(JSON.parse(raw));
    expect(parsed.metrics.artifacts_missing).toEqual([]);
    expect(parsed.artifacts_checked).toContain("src/skills/renderRagBlock.ts");
    expect(parsed.artifacts_checked).toContain("src/skills/patchSkill.ts");
    expect(parsed.artifacts_checked).toContain("src/skills/verifySkill.ts");
    expect(parsed.artifacts_checked).toContain("src/cli/installSkills.ts");
    expect(parsed.artifacts_checked).toContain("src/cli/verifyPhase3.ts");
  });

  it("every expected-pass fixture actually passes verification", () => {
    runVerify();
    const raw = readFileSync(REPORT_PATH, "utf8");
    const parsed = ReportSchema.parse(JSON.parse(raw));
    // The closure contract: fixtures_expected_pass must equal
    // fixtures_actual_pass. If a real test fixture starts failing,
    // this test surfaces the regression.
    expect(parsed.metrics.fixtures_actual_pass).toBe(
      parsed.metrics.fixtures_expected_pass,
    );
    // And the actual_pass column on every expected_pass row is true.
    for (const f of parsed.fixtures) {
      if (f.expected_pass) {
        expect(f.actual_pass).toBe(true);
      }
    }
  });

  it("the dry-run idempotence check is true (no fixture hash changed)", () => {
    runVerify();
    const raw = readFileSync(REPORT_PATH, "utf8");
    const parsed = ReportSchema.parse(JSON.parse(raw));
    expect(parsed.metrics.dry_run_idempotent).toBe(true);
    expect(parsed.metrics.dry_run_note).toMatch(/unchanged/);
  });
});
