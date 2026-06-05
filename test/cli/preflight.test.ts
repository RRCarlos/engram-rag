import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runPreflightCli } from "../../src/cli/preflight.js";

let dir: string;
let taskFile: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "engram-rag-preflight-"));
  taskFile = join(dir, "task.txt");
  writeFileSync(
    taskFile,
    "Run npm install in PowerShell without using &&.",
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
    };
    expect(parsed.degraded).toBe(false);
    expect(parsed.records.length).toBeGreaterThan(0);
    expect(parsed.applied_rules.join(" ")).toContain("PowerShell");
    expect(parsed.missing_expected_records).toEqual([]);
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
  });

  it("returns exit code 1 for unknown flags", async () => {
    const result = await runPreflightCli(["--wat"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Unknown flag");
  });

  it("returns exit code 2 for degraded adapter results", async () => {
    const result = await runPreflightCli([
      "--project",
      "engram-rag",
      "--agent",
      "sdd-apply",
      "--task-file",
      taskFile,
      "--shell",
      "powershell",
      "--simulate-degraded",
      "--json",
    ]);

    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stdout).degraded).toBe(true);
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
