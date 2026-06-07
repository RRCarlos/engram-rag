import { describe, expect, it } from "vitest";
import {
  EXPECTED_OPERATIONAL_TOOL_NAMES,
  EXPECTED_RAG_TOOL_NAMES,
  EXPECTED_TOOL_NAMES,
  runMcpSmoke,
  type McpSmokeReport,
} from "../../src/cli/mcpSmoke.js";
import { listOperationalTools } from "../../src/mcp/operationalTools.js";

/**
 * PR5 / #31: the MCP smoke script must close the verification gap
 * from the spec scenario "Docs describe current boundaries". The
 * script is a pure data check (no MCP server spawn) so every
 * assertion is CI-safe.
 */

describe("mcpSmoke: constants", () => {
  it("expects exactly the four document-RAG tools", () => {
    expect(new Set(EXPECTED_RAG_TOOL_NAMES)).toEqual(
      new Set(["rag_query", "rag_ingest", "rag_eval", "rag_stats"]),
    );
  });

  it("expects the three operational tools from the PR3 contract", () => {
    expect(new Set(EXPECTED_OPERATIONAL_TOOL_NAMES)).toEqual(
      new Set(["error_preflight", "error_learn", "error_stats"]),
    );
  });

  it("merges RAG and operational names into a 7-tool union", () => {
    expect(EXPECTED_TOOL_NAMES).toHaveLength(7);
    expect(new Set(EXPECTED_TOOL_NAMES).size).toBe(7);
  });
});

describe("mcpSmoke: tool list assertions", () => {
  const report: McpSmokeReport = runMcpSmoke({
    // CI runs on Linux but the launcher is platform-agnostic; we
    // still want the executable-bit check skipped on Windows in the
    // matrix.
    checkLauncherExecutableBit: process.platform !== "win32",
  });

  it("returns a 0 exit code when the repo is healthy", () => {
    expect(report.exit_code).toBe(0);
  });

  it("exposes the four expected document-RAG tools in its checks", () => {
    for (const name of EXPECTED_RAG_TOOL_NAMES) {
      const check = report.checks.find((c) => c.id === `rag:${name}`);
      expect(check?.pass).toBe(true);
    }
  });

  it("exposes the three expected operational tools in its checks", () => {
    for (const name of EXPECTED_OPERATIONAL_TOOL_NAMES) {
      const check = report.checks.find((c) => c.id === `op:${name}`);
      expect(check?.pass).toBe(true);
    }
  });

  it("asserts the no-rag_* guardrail in operationalTools.ts", () => {
    const guard = report.checks.find((c) => c.id === "op:no-rag-surface");
    expect(guard?.pass).toBe(true);
    expect(report.operational_calls_rag_surface).toBe(false);
  });

  it("asserts the cross-platform launcher exists and avoids `shell: true`", () => {
    const exists = report.checks.find((c) => c.id === "launcher:exists");
    const noShell = report.checks.find((c) => c.id === "launcher:no-shell");
    const noCmd = report.checks.find((c) => c.id === "launcher:no-cmd-wrap");
    expect(exists?.pass).toBe(true);
    expect(noShell?.pass).toBe(true);
    expect(noCmd?.pass).toBe(true);
    expect(report.launcher_exists).toBe(true);
    expect(report.launcher_uses_shell).toBe(false);
    expect(report.launcher_uses_cmd).toBe(false);
  });

  it("reports a sorted tool list with no missing names", () => {
    expect(report.missing_tool_names).toEqual([]);
    expect(report.tool_names).toEqual([...EXPECTED_TOOL_NAMES].sort());
  });

  it("records a started_at and finished_at timestamp", () => {
    expect(typeof report.started_at).toBe("string");
    expect(typeof report.finished_at).toBe("string");
    expect(Date.parse(report.finished_at)).toBeGreaterThanOrEqual(
      Date.parse(report.started_at),
    );
  });
});

describe("mcpSmoke: cross-tooling agreement", () => {
  it("the operational tool list is the source of truth for operational names", () => {
    const fromList = listOperationalTools().map((tool) => tool.name);
    for (const name of EXPECTED_OPERATIONAL_TOOL_NAMES) {
      expect(fromList).toContain(name);
    }
  });
});

describe("mcpSmoke: launcher comment-stripping (regression for false positives)", () => {
  // The launcher source includes a docstring that names the very
  // tokens we want to forbid (`shell: true`, `cmd /c`, `cmd.exe`,
  // `bash -c`) so future readers know *why* the launcher avoids them.
  // The smoke scanner MUST strip comments before running those
  // patterns, otherwise the docstring trips the guard and the
  // operator sees a misleading "launcher uses shell: true" failure.
  it("the docstring at the top of the launcher does NOT trip the no-shell guard", () => {
    // The default report already exercises this path. We assert the
    // specific checks are passing and the boolean fields reflect a
    // healthy launcher. This pins the comment-stripping fix so a
    // future refactor of the regex (or the docstring) does not
    // silently regress.
    const report = runMcpSmoke({
      checkLauncherExecutableBit: process.platform !== "win32",
    });
    const noShell = report.checks.find((c) => c.id === "launcher:no-shell");
    const noCmd = report.checks.find((c) => c.id === "launcher:no-cmd-wrap");
    expect(noShell?.pass).toBe(true);
    expect(noCmd?.pass).toBe(true);
    expect(report.launcher_uses_shell).toBe(false);
    expect(report.launcher_uses_cmd).toBe(false);
  });
});
