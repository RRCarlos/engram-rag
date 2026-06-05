import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  findSddSkillFiles,
  patchLiveSkillContent,
  runPatchLiveSkills,
  runPatchLiveSkillsCli,
  type PatchLiveSkillsReport,
} from "../../src/cli/patchLiveSkills.js";

let dir: string;

const CLEAN_SKILL = `---
name: sdd-apply
description: Test SDD apply skill.
---

# SDD Apply

Existing instructions.
`;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "engram-rag-patch-live-skills-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeSkill(name: string, content = CLEAN_SKILL): string {
  const skillDir = join(dir, name);
  mkdirSync(skillDir, { recursive: true });
  const file = join(skillDir, "SKILL.md");
  writeFileSync(file, content, "utf8");
  return file;
}

function execNode(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, args, { cwd: process.cwd() }, (error, stdout, stderr) => {
      if (error) reject(Object.assign(error, { stdout, stderr }));
      else resolve({ stdout, stderr });
    });
  });
}

describe("patchLiveSkills", () => {
  it("finds only sdd-*/SKILL.md files", () => {
    const apply = writeSkill("sdd-apply");
    const verify = writeSkill("nested/sdd-verify");
    writeSkill("not-sdd");

    expect(findSddSkillFiles(dir)).toEqual([verify, apply].sort());
  });

  it("inserts the live preflight block idempotently", () => {
    const first = patchLiveSkillContent(CLEAN_SKILL);
    expect(first.changed).toBe(true);
    expect(first.content).toContain("ENGRAM_RAG_LIVE_PREFLIGHT_START");
    expect(first.content).toContain("node --import tsx src/cli/preflightLive.ts");
    expect(first.content).toContain("applied_rules");
    expect(first.content).toContain("missing_expected_records");
    expect(first.content).toContain("degraded");

    const second = patchLiveSkillContent(first.content);
    expect(second.changed).toBe(false);
    expect(second.content).toBe(first.content);
  });

  it("dry-run reports pending changes without writing files", () => {
    const file = writeSkill("sdd-apply");
    const before = readFileSync(file, "utf8");

    const { report } = runPatchLiveSkills({ skillDir: dir, dryRun: true, json: true });

    expect(report.scanned).toBe(1);
    expect(report.counts.skipped).toBe(1);
    expect(report.counts.changed).toBe(0);
    expect(readFileSync(file, "utf8")).toBe(before);
  });

  it("writes once, then reports unchanged on the second run", () => {
    const file = writeSkill("sdd-apply");

    const first = runPatchLiveSkills({ skillDir: dir, dryRun: false, json: true });
    expect(first.report.counts.changed).toBe(1);
    const afterFirst = readFileSync(file, "utf8");

    const second = runPatchLiveSkills({ skillDir: dir, dryRun: false, json: true });
    expect(second.report.counts.unchanged).toBe(1);
    expect(readFileSync(file, "utf8")).toBe(afterFirst);
  });

  it("returns a JSON report through the in-process CLI", () => {
    writeSkill("sdd-apply");

    const result = runPatchLiveSkillsCli(["--skill-dir", dir, "--dry-run", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const report = JSON.parse(result.stdout) as PatchLiveSkillsReport;
    expect(report.dry_run).toBe(true);
    expect(report.scanned).toBe(1);
    expect(report.counts.skipped).toBe(1);
  });

  it("refuses to run without an explicit --skill-dir", () => {
    const result = runPatchLiveSkillsCli([]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("missing required --skill-dir");
  });

  it("runs through the direct CLI entrypoint", async () => {
    writeSkill("sdd-apply");

    const { stdout, stderr } = await execNode([
      "--import",
      "tsx",
      "src/cli/patchLiveSkills.ts",
      "--skill-dir",
      dir,
      "--dry-run",
      "--json",
    ]);

    expect(stderr).toBe("");
    const report = JSON.parse(stdout) as PatchLiveSkillsReport;
    expect(report.scanned).toBe(1);
    expect(report.counts.skipped).toBe(1);
  });
});
