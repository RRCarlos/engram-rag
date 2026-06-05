import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { runPreflightLiveCli } from "../../src/cli/preflightLive.js";
import { createFakeAdapter } from "../../src/engram/fakeEngramAdapter.js";
import { loadAllKnowledgeRecords } from "../../src/eval/runScenario.js";

function execNode(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, args, { cwd: process.cwd() }, (error, stdout, stderr) => {
      if (error) reject(Object.assign(error, { stdout, stderr }));
      else resolve({ stdout, stderr });
    });
  });
}

describe("preflight-live CLI", () => {
  it("parses arguments and prints the required JSON projection", async () => {
    const result = await runPreflightLiveCli(
      [
        "--project",
        "engram-rag",
        "--agent",
        "sdd-apply",
        "--task",
        "Run npm install in PowerShell without using &&.",
        "--action",
        "shell",
        "--shell",
        "powershell",
        "--cwd",
        "C:/Users/PC/engram-rag",
        "--base-url",
        "http://127.0.0.1:7437",
      ],
      () => createFakeAdapter(loadAllKnowledgeRecords()),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const parsed = JSON.parse(result.stdout) as {
      applied_rules: string[];
      missing_expected_records: string[];
      degraded: boolean;
      latency_ms: number;
      records: unknown[];
    };
    expect(parsed.applied_rules.join(" ")).toContain("PowerShell");
    expect(parsed.missing_expected_records).toEqual([]);
    expect(parsed.degraded).toBe(false);
    expect(parsed.latency_ms).toBeGreaterThanOrEqual(0);
    expect(parsed.records.length).toBeGreaterThan(0);
  });

  it("returns a clear unavailable error when healthCheck fails", async () => {
    const adapter = createFakeAdapter(loadAllKnowledgeRecords()) as ReturnType<typeof createFakeAdapter> & {
      healthCheck: () => Promise<boolean>;
    };
    adapter.healthCheck = async () => false;

    const result = await runPreflightLiveCli(
      [
        "--project",
        "engram-rag",
        "--agent",
        "sdd-apply",
        "--task",
        "Any task",
        "--action",
        "read",
        "--base-url",
        "http://127.0.0.1:7437",
      ],
      () => adapter,
    );

    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain("Live Engram unavailable");
  });

  it("returns exit code 1 for invalid arguments", async () => {
    const result = await runPreflightLiveCli(["--project", "engram-rag"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Missing required flags");
  });

  it("runs successfully through the direct CLI entrypoint", async () => {
    const observation = {
      id: 1,
      sync_id: "obs-direct-cli",
      session_id: "direct-cli-test",
      type: "bugfix",
      title: "PowerShell && failure",
      content:
        "**What**: El agente sdd-apply intentó usar `&&` en PowerShell.\n" +
        "**Why**: Usar `; if ($?) { ... }` en PowerShell.\n" +
        "**Where**: direct CLI test",
    };
    const server = createServer((req, res) => {
      res.setHeader("content-type", "application/json");
      if (req.url === "/health") res.end(JSON.stringify({ status: "ok" }));
      else if (req.url?.startsWith("/search")) res.end(JSON.stringify([observation]));
      else if (req.url === "/observations/1") res.end(JSON.stringify(observation));
      else {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "not found" }));
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const { stdout, stderr } = await execNode([
        "--import",
        "tsx",
        "src/cli/preflightLive.ts",
        "--project",
        "engram-rag",
        "--agent",
        "sdd-apply",
        "--task",
        "Run a PowerShell command without &&.",
        "--action",
        "shell",
        "--shell",
        "powershell",
        "--base-url",
        `http://127.0.0.1:${port}`,
      ]);
      expect(stderr).toBe("");
      expect(JSON.parse(stdout)).toMatchObject({ degraded: false });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
