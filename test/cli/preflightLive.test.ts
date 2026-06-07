import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { runPreflightLiveCli } from "../../src/cli/preflightLive.js";
import { createFakeAdapter } from "../../src/engram/fakeEngramAdapter.js";
import { loadAllKnowledgeRecords } from "../../src/eval/runScenario.js";

function execNode(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(process.execPath, args, { cwd: process.cwd() }, (error, stdout, stderr) => {
      const exitCode = error && typeof (error as { code?: unknown }).code === "number"
        ? (error as { code: number }).code
        : 0;
      resolve({ exitCode, stdout, stderr });
    });
  });
}

describe("preflight-live CLI", () => {
  it("parses arguments and prints the required JSON projection for a clean PowerShell task", async () => {
    const result = await runPreflightLiveCli(
      [
        "--project",
        "engram-rag",
        "--agent",
        "sdd-apply",
        "--task",
        "Run npm install in PowerShell cleanly.",
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
      enforcement: { outcome: string; corrected_command?: string; trace_id: string };
    };
    expect(parsed.applied_rules.join(" ")).toContain("PowerShell");
    expect(parsed.missing_expected_records).toEqual([]);
    expect(parsed.degraded).toBe(false);
    expect(parsed.latency_ms).toBeGreaterThanOrEqual(0);
    expect(parsed.records.length).toBeGreaterThan(0);
    expect(parsed.enforcement.outcome).toBe("allow");
    expect(parsed.enforcement.corrected_command).toBeUndefined();
    expect(parsed.enforcement.trace_id).toMatch(/^trc-[0-9a-f]{16}$/);
  });

  it("returns exit code 4 with the corrected command for a PowerShell && task", async () => {
    const result = await runPreflightLiveCli(
      [
        "--project",
        "engram-rag",
        "--agent",
        "sdd-apply",
        "--task",
        "Run `cd foo && npm install` in PowerShell.",
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

    expect(result.exitCode).toBe(4);
    expect(result.stderr).toBe("");
    const parsed = JSON.parse(result.stdout) as {
      enforcement: { outcome: string; corrected_command?: string; reason: string };
    };
    expect(parsed.enforcement.outcome).toBe("correct");
    expect(parsed.enforcement.corrected_command).toBe("cmd1; if ($?) { cmd2 }");
    expect(parsed.enforcement.reason).toContain("PowerShell");
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

  it("returns exit code 4 through the direct CLI entrypoint for a PowerShell && task", async () => {
    const forbiddenAlias = ["protocol", "rigor", "v1"].join("/");
    const legacyObservation = {
      id: 999,
      sync_id: "obs-legacy-alias",
      session_id: "direct-cli-test",
      type: "bugfix",
      title: "Legacy alias hit",
      topic_key: `${forbiddenAlias}/legacy-hit`,
      content:
        "**What**: Legacy PowerShell alias hit that must not abort search.\n" +
        "**Why**: It is intentionally invalid for the canonical v2 contract.\n" +
        "**Where**: direct CLI test",
    };
    const observation = {
      id: 152,
      sync_id: "obs-direct-cli",
      session_id: "direct-cli-test",
      type: "bugfix",
      title: "PowerShell && failure",
      content:
        "**What**: El agente sdd-apply intentó usar `&&` en PowerShell.\n" +
        "**Why**: Usar `cmd1; if ($?) { cmd2 }` en PowerShell.\n" +
        "**Where**: direct CLI test",
    };
    const server = createServer((req, res) => {
      res.setHeader("content-type", "application/json");
      if (req.url === "/health") res.end(JSON.stringify({ status: "ok" }));
      else if (req.url?.startsWith("/search")) res.end(JSON.stringify([legacyObservation, observation]));
      else if (req.url === "/observations/152") res.end(JSON.stringify(observation));
      else {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "not found" }));
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const { exitCode, stdout, stderr } = await execNode([
        "--import",
        "tsx",
        "src/cli/preflightLive.ts",
        "--project",
        "engram-rag",
        "--agent",
        "sdd-apply",
        "--task",
        "Run `cd foo && npm install` in PowerShell.",
        "--action",
        "shell",
        "--shell",
        "powershell",
        "--base-url",
        `http://127.0.0.1:${port}`,
      ]);
      expect(exitCode).toBe(4);
      expect(stderr).toBe("");
      const parsed = JSON.parse(stdout) as {
        degraded: boolean;
        consulted_ids: number[];
        missing_expected_records: string[];
        correction_candidates: string[];
        quarantined_records: { id: number; reason: string; source: string }[];
        enforcement: { outcome: string; corrected_command?: string; trace_id: string };
      };
      expect(parsed).toMatchObject({
        degraded: false,
        consulted_ids: [152],
        missing_expected_records: [],
        correction_candidates: ["cmd1; if ($?) { cmd2 }"],
        quarantined_records: [
          { id: 999, reason: expect.stringContaining("Forbidden v1"), source: "search" },
        ],
      });
      expect(parsed.enforcement.outcome).toBe("correct");
      expect(parsed.enforcement.corrected_command).toBe("cmd1; if ($?) { cmd2 }");
      expect(parsed.enforcement.trace_id).toMatch(/^trc-[0-9a-f]{16}$/);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
