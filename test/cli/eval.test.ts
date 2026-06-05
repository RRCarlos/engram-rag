import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseEvalReport } from "../../src/eval/types.js";

const REPO_ROOT = resolve(__dirname, "..", "..");
const REPORT_PATH = resolve(REPO_ROOT, "reports/phase4/eval-report.json");

/**
 * Subprocess-level test for the `eval` CLI. The other tests in
 * `runScenario.test.ts` exercise the in-process function; this
 * file asserts that the script works when launched as a real
 * child process — the same way `verify:phase4` (PR-C) will
 * invoke it.
 */
function runEvalSubprocess(): { stdout: string; status: number } {
  try {
    const stdout = execFileSync("node", ["--import", "tsx", "src/cli/eval.ts"], {
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

describe("eval CLI subprocess", () => {
  if (existsSync(REPORT_PATH)) {
    unlinkSync(REPORT_PATH);
  }

  it("exits 0 and writes the report to disk", () => {
    const result = runEvalSubprocess();
    expect(result.status).toBe(0);
    expect(existsSync(REPORT_PATH)).toBe(true);
  });

  it("the written report parses as EvalReport", () => {
    runEvalSubprocess();
    const raw = JSON.parse(readFileSync(REPORT_PATH, "utf8"));
    const report = parseEvalReport(raw);
    expect(report.suite).toBe("phase4-default");
    expect(report.scenarios_total).toBeGreaterThanOrEqual(5);
  });

  it("prints the PASS line for every scenario", () => {
    const result = runEvalSubprocess();
    expect(result.stdout).toMatch(/\[PASS\] powershell-and/);
    expect(result.stdout).toMatch(/\[PASS\] sdd-spec-gherkin/);
    expect(result.stdout).toMatch(/\[PASS\] shell-unknown-shell/);
    expect(result.stdout).toMatch(/\[PASS\] convention-skill-frontmatter/);
    expect(result.stdout).toMatch(/\[PASS\] spec-gherkin-with-extra-noise/);
  });
});
