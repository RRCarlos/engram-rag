import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const REPO_ROOT = resolve(__dirname, "..", "..");
const REPORT_PATH = resolve(REPO_ROOT, "reports/phase1/verify-report.json");

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
  }),
});

function runVerify(): { stdout: string; status: number } {
  try {
    const stdout = execFileSync("node", ["--import", "tsx", "src/cli/verifyPhase1.ts"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { stdout, status: 0 };
  } catch (error) {
    const err = error as { status?: number; stdout?: string };
    return { stdout: err.stdout ?? "", status: err.status ?? 1 };
  }
}

describe("verifyPhase1 CLI", () => {
  it("writes reports/phase1/verify-report.json with the design schema", () => {
    // Ensure a clean slate so we can assert the file appears.
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

  it("lists every Phase 1 artifact as checked", () => {
    runVerify();
    const raw = readFileSync(REPORT_PATH, "utf8");
    const parsed = ReportSchema.parse(JSON.parse(raw));
    expect(parsed.artifacts_checked).toContain("src/contracts/topicKeys.ts");
    expect(parsed.artifacts_checked).toContain(
      "fixtures/knowledge/powershell-and.json",
    );
    expect(parsed.artifacts_checked).toContain(
      ".github/workflows/ci.yml",
    );
  });
});
