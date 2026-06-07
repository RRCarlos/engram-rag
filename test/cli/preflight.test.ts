import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runPreflightCli } from "../../src/cli/preflight.js";

let dir: string;
let taskFile: string;
let powershellAndTaskFile: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "engram-rag-preflight-"));
  taskFile = join(dir, "clean.txt");
  writeFileSync(taskFile, "Run npm install in PowerShell cleanly.", "utf8");
  powershellAndTaskFile = join(dir, "powershell-and.txt");
  writeFileSync(
    powershellAndTaskFile,
    "Run `cd foo && npm install` in PowerShell.",
    "utf8",
  );
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("preflight CLI", () => {
  it("returns JSON preflight output for a valid task", async () => {
    const result = await runPreflightCli([
      "--project",
      "engram-rag",
      "--agent",
      "sdd-apply",
      "--task-file",
      taskFile,
      "--shell",
      "powershell",
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const parsed = JSON.parse(result.stdout) as {
      records: unknown[];
      applied_rules: string[];
      missing_expected_records: string[];
      degraded: boolean;
      enforcement: { outcome: string; corrected_command?: string; trace_id: string };
    };
    expect(parsed.degraded).toBe(false);
    expect(parsed.records.length).toBeGreaterThan(0);
    expect(parsed.applied_rules.join(" ")).toContain("PowerShell");
    expect(parsed.missing_expected_records).toEqual([]);
    expect(parsed.enforcement.outcome).toBe("allow");
    expect(parsed.enforcement.corrected_command).toBeUndefined();
  });

  it("returns pretty output by default", async () => {
    const result = await runPreflightCli([
      "--project",
      "engram-rag",
      "--agent",
      "sdd-apply",
      "--task-file",
      taskFile,
      "--shell",
      "powershell",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Engram preflight for sdd-apply");
    expect(result.stdout).toContain("degraded=false");
    expect(result.stdout).toContain("enforcement=allow");
  });

  it("returns exit code 1 for unknown flags", async () => {
    const result = await runPreflightCli(["--wat"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Unknown flag");
  });

  it("returns exit code 2 for degraded adapter results on a safe action", async () => {
    const result = await runPreflightCli([
      "--project",
      "engram-rag",
      "--agent",
      "sdd-apply",
      "--task-file",
      taskFile,
      "--action",
      "read",
      "--shell",
      "powershell",
      "--simulate-degraded",
      "--json",
    ]);

    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stdout).degraded).toBe(true);
  });

  it("returns exit code 4 for a PowerShell && task even when preflight is clean", async () => {
    const result = await runPreflightCli([
      "--project",
      "engram-rag",
      "--agent",
      "sdd-apply",
      "--task-file",
      powershellAndTaskFile,
      "--shell",
      "powershell",
      "--json",
    ]);

    expect(result.exitCode).toBe(4);
    const parsed = JSON.parse(result.stdout) as {
      enforcement: { outcome: string; corrected_command?: string };
    };
    expect(parsed.enforcement.outcome).toBe("correct");
    expect(parsed.enforcement.corrected_command).toBe("cmd1; if ($?) { cmd2 }");
  });

  it("returns exit code 4 for a PowerShell && task when preflight is degraded", async () => {
    const result = await runPreflightCli([
      "--project",
      "engram-rag",
      "--agent",
      "sdd-apply",
      "--task-file",
      powershellAndTaskFile,
      "--shell",
      "powershell",
      "--simulate-degraded",
      "--json",
    ]);

    expect(result.exitCode).toBe(4);
    const parsed = JSON.parse(result.stdout) as {
      degraded: boolean;
      enforcement: { outcome: string; reason: string };
    };
    expect(parsed.degraded).toBe(true);
    expect(parsed.enforcement.outcome).toBe("blocked");
    expect(parsed.enforcement.reason).toContain("degraded");
  });

  it("returns exit code 3 when the task file is missing", async () => {
    const result = await runPreflightCli([
      "--project",
      "engram-rag",
      "--agent",
      "sdd-apply",
      "--task-file",
      join(dir, "missing.txt"),
    ]);

    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain("Task file not found");
  });
});
