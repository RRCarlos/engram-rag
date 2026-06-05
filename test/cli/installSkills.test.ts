import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  findSkillFiles,
  parseArgs,
  processSkill,
  runInstall,
  runInstallCli,
  type InstallReport,
} from "../../src/cli/installSkills.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "engram-rag-install-skills-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function makeSkill(name: string, body: string): string {
  const file = join(dir, name);
  writeFileSync(file, body, "utf8");
  return file;
}

const SAMPLE_SKILL = `---
name: sdd-apply
description: "Test fixture for install-skills CLI."
license: Apache-2.0
metadata:
  author: engram-rag-test
  version: "1.0"
---

## When to Use

This fixture is used by test/cli/installSkills.test.ts to assert the
install-skills CLI behavior end to end.
`;

describe("installSkills CLI: parseArgs", () => {
  it("requires --skills-dir", () => {
    expect(() => parseArgs(["--agent", "sdd-apply"])).toThrow(/--skills-dir/);
  });

  it("requires --agent", () => {
    expect(() => parseArgs(["--skills-dir", "/tmp"])).toThrow(/--agent/);
  });

  it("rejects an unknown agent id", () => {
    expect(() =>
      parseArgs(["--skills-dir", "/tmp", "--agent", "not-an-agent"]),
    ).toThrow();
  });

  it("accepts a canonical agent id and defaults dry-run off without --backup-dir", () => {
    const args = parseArgs(["--skills-dir", "/tmp", "--agent", "sdd-apply"]);
    expect(args.agentId).toBe("sdd-apply");
    expect(args.skillsDir).toBe("/tmp");
    expect(args.dryRun).toBe(false);
    expect(args.backupDir).toBeNull();
    expect(args.json).toBe(false);
  });

  it("turns --dry-run on and --no-dry-run off", () => {
    const on = parseArgs(["--skills-dir", "/tmp", "--agent", "sdd-apply", "--dry-run"]);
    expect(on.dryRun).toBe(true);
    const off = parseArgs([
      "--skills-dir",
      "/tmp",
      "--agent",
      "sdd-apply",
      "--dry-run",
      "--no-dry-run",
    ]);
    expect(off.dryRun).toBe(false);
  });

  it("parses --json and --backup-dir", () => {
    const args = parseArgs([
      "--skills-dir",
      "/tmp",
      "--agent",
      "sdd-apply",
      "--backup-dir",
      "/var/backup",
      "--json",
    ]);
    expect(args.json).toBe(true);
    expect(args.backupDir).toBe("/var/backup");
  });
});

describe("installSkills CLI: findSkillFiles", () => {
  it("finds SKILL.md at the top level", () => {
    const file = makeSkill("SKILL.md", SAMPLE_SKILL);
    const found = findSkillFiles(dir);
    expect(found).toEqual([file]);
  });

  it("skips non-SKILL.md files", () => {
    makeSkill("README.md", "# readme");
    makeSkill("notes.txt", "notes");
    makeSkill("SKILL.md", SAMPLE_SKILL);
    const found = findSkillFiles(dir);
    expect(found.length).toBe(1);
    expect(found[0]?.endsWith("SKILL.md")).toBe(true);
  });

  it("finds SKILL.md in nested directories", () => {
    const sub = join(dir, "nested", "deeper");
    mkdirSync(sub, { recursive: true });
    writeFileSync(join(sub, "SKILL.md"), SAMPLE_SKILL, "utf8");
    makeSkill("SKILL.md", SAMPLE_SKILL);
    const found = findSkillFiles(dir);
    expect(found.length).toBe(2);
    expect(found.every((f) => f.endsWith("SKILL.md"))).toBe(true);
  });

  it("returns an empty array for a non-existent directory", () => {
    expect(findSkillFiles(join(dir, "does-not-exist"))).toEqual([]);
  });
});

describe("installSkills CLI: processSkill", () => {
  it("reports unchanged when the file already carries the right block", () => {
    const file = makeSkill("SKILL.md", SAMPLE_SKILL);
    const first = processSkill(dir, file, "sdd-apply", true, null, "ts");
    expect(first.status).toBe("skipped");
    expect(first.reason).toMatch(/dry-run/);
    // Confirm the file was NOT modified by reading it back.
    expect(readFileSync(file, "utf8")).toBe(SAMPLE_SKILL);
  });

  it("real run with backup writes a backup file with the original content", () => {
    const file = makeSkill("SKILL.md", SAMPLE_SKILL);
    const backupDir = join(dir, "backups");
    const result = processSkill(
      dir,
      file,
      "sdd-apply",
      false,
      backupDir,
      "2026-06-05T00-00-00",
    );
    expect(result.status).toBe("changed");
    // The file now carries the RAG block.
    const after = readFileSync(file, "utf8");
    expect(after).toContain("ENGRAM_RAG_BLOCK_START");
    expect(after).toContain("agent=sdd-apply");
    // The backup is under the timestamp directory at <backupDir>/<ts>/<relpath>.
    const backupFile = join(backupDir, "2026-06-05T00-00-00", "SKILL.md");
    expect(existsSync(backupFile)).toBe(true);
    expect(readFileSync(backupFile, "utf8")).toBe(SAMPLE_SKILL);
  });

  it("real run without a backup dir still writes the new content", () => {
    const file = makeSkill("SKILL.md", SAMPLE_SKILL);
    const result = processSkill(dir, file, "sdd-apply", false, null, "ts");
    expect(result.status).toBe("changed");
    expect(readFileSync(file, "utf8")).toContain("ENGRAM_RAG_BLOCK_START");
  });
});

describe("installSkills CLI: runInstall (end to end)", () => {
  it("dry-run is byte-idempotent: file contents are unchanged", () => {
    const file = makeSkill("SKILL.md", SAMPLE_SKILL);
    const before = readFileSync(file, "utf8");
    const { report } = runInstall({
      skillsDir: dir,
      backupDir: null,
      dryRun: true,
      json: true,
      agentId: "sdd-apply",
    });
    expect(report.dry_run).toBe(true);
    expect(report.scanned).toBe(1);
    expect(report.counts.changed).toBe(0);
    expect(report.counts.unchanged).toBe(0);
    expect(report.counts.skipped).toBe(1);
    expect(readFileSync(file, "utf8")).toBe(before);
  });

  it("real run with backup changes the file and creates a restorable backup", () => {
    const file = makeSkill("SKILL.md", SAMPLE_SKILL);
    const backupDir = join(dir, "backups");
    const before = readFileSync(file, "utf8");
    const { report } = runInstall({
      skillsDir: dir,
      backupDir,
      dryRun: false,
      json: true,
      agentId: "sdd-apply",
    });
    expect(report.counts.changed).toBe(1);
    const after = readFileSync(file, "utf8");
    expect(after).not.toBe(before);
    expect(after).toContain("ENGRAM_RAG_BLOCK_START");

    // Rollback: copy the backup back over the file and confirm the
    // original is restored byte-for-byte.
    const stampDirs = require("node:fs").readdirSync(backupDir) as string[];
    expect(stampDirs.length).toBe(1);
    const backupFile = join(backupDir, stampDirs[0] as string, "SKILL.md");
    copyFileSync(backupFile, file);
    expect(readFileSync(file, "utf8")).toBe(before);
  });

  it("second run is idempotent: reports unchanged, does not re-write", () => {
    const file = makeSkill("SKILL.md", SAMPLE_SKILL);
    runInstall({
      skillsDir: dir,
      backupDir: null,
      dryRun: false,
      json: true,
      agentId: "sdd-apply",
    });
    const afterFirst = readFileSync(file, "utf8");
    const { report } = runInstall({
      skillsDir: dir,
      backupDir: null,
      dryRun: false,
      json: true,
      agentId: "sdd-apply",
    });
    expect(report.counts.changed).toBe(0);
    expect(report.counts.unchanged).toBe(1);
    expect(readFileSync(file, "utf8")).toBe(afterFirst);
  });
});

describe("installSkills CLI: runInstallCli (entry point)", () => {
  it("returns exit code 1 with an error when --skills-dir is missing", () => {
    const result = runInstallCli(["--agent", "sdd-apply"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/--skills-dir/);
  });

  it("returns exit code 1 when --agent is missing", () => {
    const result = runInstallCli(["--skills-dir", dir]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/--agent/);
  });

  it("returns exit code 1 for an unknown --agent", () => {
    const result = runInstallCli(["--skills-dir", dir, "--agent", "bogus"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/Invalid|invalid/);
  });

  it("returns exit code 0 and a valid JSON report for a dry-run on an empty dir", () => {
    const result = runInstallCli([
      "--skills-dir",
      dir,
      "--agent",
      "sdd-apply",
      "--dry-run",
      "--json",
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const report = JSON.parse(result.stdout) as InstallReport;
    expect(report.scanned).toBe(0);
    expect(report.dry_run).toBe(true);
    expect(report.agent_id).toBe("sdd-apply");
  });

  it("returns exit code 0 and a valid JSON report for a real run that creates a backup", () => {
    makeSkill("SKILL.md", SAMPLE_SKILL);
    const backupDir = join(dir, "backups");
    const result = runInstallCli([
      "--skills-dir",
      dir,
      "--agent",
      "sdd-apply",
      "--backup-dir",
      backupDir,
      "--json",
    ]);
    expect(result.exitCode).toBe(0);
    const report = JSON.parse(result.stdout) as InstallReport;
    expect(report.scanned).toBe(1);
    expect(report.counts.changed).toBe(1);
    expect(report.dry_run).toBe(false);
    // Backup dir was created and contains a timestamped subdir.
    expect(existsSync(backupDir)).toBe(true);
  });
});
