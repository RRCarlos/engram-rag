import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { runVerifyAll, type VerifyAllReport } from "../../src/cli/verifyAll.js";
import { runMcpSmokeCli } from "../../src/cli/mcpSmoke.js";

/**
 * PR5 / #31: the unified `verify:all` entry point must run
 * focused tests, guardrails, typecheck, and the MCP smoke
 * check end-to-end, and exit non-zero on any failure. The
 * tests below exercise the library entry point with
 * `skipLive` (the live P0 smoke is opt-in) so the suite
 * stays CI-safe and quick.
 */

// The unified entry point spawns vitest (focused + guardrails),
// `tsc --noEmit`, and runs the in-process mcp:smoke check. On a
// cold CI box that takes well over 5 seconds, so the describe
// blocks below opt into a 120-second timeout per test. The tests
// themselves are the regression for the recursive-`test:verify`
// failure mode and the missing-tool surface.
const SPAWNING_TEST_TIMEOUT_MS = 120_000;

const REPO_ROOT = resolve(__dirname, "..", "..");
const REPORT_PATH = resolve(REPO_ROOT, "reports", "verify-all", "verify-report.json");

async function runAllSkippingLiveAndReport(
  reportPath: string,
  overrides: Parameters<typeof runVerifyAll>[0] = {},
): Promise<VerifyAllReport> {
  if (existsSync(reportPath)) {
    rmSync(reportPath, { force: true });
  }
  const report = await runVerifyAll({
    skipLive: true,
    reportPath,
    ...overrides,
  });
  return report;
}

describe("verifyAll: focused checks", () => {
  it(
    "runs the focused test suite and exits 0 when everything passes",
    { timeout: SPAWNING_TEST_TIMEOUT_MS },
    async () => {
      const report = await runAllSkippingLiveAndReport(REPORT_PATH);
      expect(report.exit_code).toBe(0);
      expect(report.summary.failed).toBe(0);
      expect(report.summary.passed).toBe(report.summary.total);
    },
  );

  it(
    "includes the focused, guardrail, typecheck, and mcp:smoke checks",
    { timeout: SPAWNING_TEST_TIMEOUT_MS },
    async () => {
      const report = await runAllSkippingLiveAndReport(REPORT_PATH);
      const ids = new Set(report.checks.map((c) => c.id));
      expect(ids.has("vitest:focused")).toBe(true);
      expect(ids.has("vitest:guardrails")).toBe(true);
      expect(ids.has("tsc:noemit")).toBe(true);
      expect(ids.has("mcp:smoke")).toBe(true);
    },
  );

  it(
    "does NOT recursively re-spawn the focused suite it just ran",
    { timeout: SPAWNING_TEST_TIMEOUT_MS },
    async () => {
      // The previous `test:verify` script recursed into Vitest by
      // running `test/cli/verifyPhase*.test.ts`, each of which
      // re-spawned `vitest run --exclude "test/cli/verifyPhase*"` from
      // inside `verifyPhaseN.ts`. The new entry point never names any
      // of those files in its execution graph, so the recursion is
      // gone by construction.
      const report = await runAllSkippingLiveAndReport(REPORT_PATH);
      const ids = report.checks.map((c) => c.id);
      expect(ids).not.toContain("verify:phase1");
      expect(ids).not.toContain("verify:phase2");
      expect(ids).not.toContain("verify:phase3");
      expect(ids).not.toContain("verify:phase4");
    },
  );

  it(
    "writes a machine-readable verify report to reports/verify-all/",
    { timeout: SPAWNING_TEST_TIMEOUT_MS },
    async () => {
      await runAllSkippingLiveAndReport(REPORT_PATH);
      expect(existsSync(REPORT_PATH)).toBe(true);
      const raw = readFileSync(REPORT_PATH, "utf8");
      const parsed = JSON.parse(raw) as VerifyAllReport;
      expect(parsed.command).toBe("verify:all");
      expect(parsed.exit_code).toBe(0);
      expect(parsed.focused_files).toContain("test/engram/trace.test.ts");
      expect(parsed.focused_files).toContain("test/mcp/operationalTools.test.ts");
      expect(parsed.guardrail_files).toContain("test/guardrails/noLegacyTopicKeys.test.ts");
      expect(parsed.guardrail_files).toContain("test/guardrails/noLiveMcpInTests.test.ts");
      expect(parsed.live_p0_smoke_run).toBe(false);
    },
  );
});

describe("verifyAll: live P0 smoke gating", () => {
  it(
    "skips the live P0 smoke when ENGRAM_BASE_URL is unset",
    { timeout: SPAWNING_TEST_TIMEOUT_MS },
    async () => {
      const previous = process.env.ENGRAM_BASE_URL;
      const previousProject = process.env.ENGRAM_PROJECT;
      delete process.env.ENGRAM_BASE_URL;
      delete process.env.ENGRAM_PROJECT;
      try {
        const report = await runVerifyAll({
          skipVitest: true,
          skipGuardrails: true,
          skipTypecheck: true,
          reportPath: REPORT_PATH,
        });
        expect(report.live_p0_smoke_run).toBe(false);
        expect(report.live_p0_smoke?.ran).toBe(false);
        expect(report.live_p0_smoke?.outcome).toBe("skipped");
        // A skipped live smoke does not fail the gate.
        expect(report.exit_code).toBe(0);
      } finally {
        if (previous !== undefined) process.env.ENGRAM_BASE_URL = previous;
        if (previousProject !== undefined) process.env.ENGRAM_PROJECT = previousProject;
      }
    },
  );

  it(
    "respects --skip-live even when ENGRAM_BASE_URL is set",
    { timeout: SPAWNING_TEST_TIMEOUT_MS },
    async () => {
      const previous = process.env.ENGRAM_BASE_URL;
      process.env.ENGRAM_BASE_URL = "http://127.0.0.1:1";
      try {
        const report = await runVerifyAll({
          skipVitest: true,
          skipGuardrails: true,
          skipTypecheck: true,
          skipLive: true,
          reportPath: REPORT_PATH,
        });
        expect(report.live_p0_smoke?.ran).toBe(false);
        expect(report.live_p0_smoke?.detail).toMatch(/skipped/i);
      } finally {
        if (previous === undefined) delete process.env.ENGRAM_BASE_URL;
        else process.env.ENGRAM_BASE_URL = previous;
      }
    },
  );
});

describe("verifyAll: mcp:smoke linkage", () => {
  it(
    "embeds the mcp:smoke report in the unified report",
    { timeout: SPAWNING_TEST_TIMEOUT_MS },
    async () => {
      const report = await runAllSkippingLiveAndReport(REPORT_PATH);
      expect(report.mcp_smoke).not.toBeNull();
      expect(report.mcp_smoke?.exit_code).toBe(0);
      expect(report.mcp_smoke?.tool_names).toContain("error_preflight");
      expect(report.mcp_smoke?.tool_names).toContain("rag_query");
    },
  );
});

describe("mcp:smoke CLI", () => {
  it("returns exit 0 and prints the human-readable summary by default", async () => {
    const result = await runMcpSmokeCli([]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/mcp:smoke/);
    expect(result.stdout).toMatch(/PASS/);
  });

  it("emits JSON when --json is passed", async () => {
    const result = await runMcpSmokeCli(["--json"]);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { command: string; exit_code: number };
    expect(parsed.command).toBe("mcp:smoke");
    expect(parsed.exit_code).toBe(0);
  });

  it("returns exit 1 on unknown flags", async () => {
    const result = await runMcpSmokeCli(["--rogue"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/Unknown flag/);
  });
});
