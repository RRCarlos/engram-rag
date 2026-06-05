/**
 * `engram-rag install-skills` CLI.
 *
 * Walks a directory of skill files, applies the Engram RAG block
 * patcher to each `SKILL.md`, and either reports what would change
 * (dry-run, the default) or actually writes the new content with a
 * timestamped backup (when `--no-dry-run` is implied by a
 * `--backup-dir`).
 *
 * This is the safe-by-default wrapper around the pure `patchSkill`
 * function: the dry-run path is for human review, the write path is
 * for scripted/operator-driven runs that have already inspected the
 * dry-run output and confirmed a backup target.
 *
 * Usage:
 *   engram-rag install-skills \
 *     --skills-dir <path> \
 *     --agent <agent-id> \
 *     [--dry-run] \
 *     [--backup-dir <path>] \
 *     --json
 *
 * Exit codes:
 *   0 = all files scanned, no fatal errors
 *   1 = a fatal error happened (missing dir, missing required flag)
 *   2 = at least one file failed to patch
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { patchSkill } from "../skills/patchSkill.js";
import { AgentIdSchema, type AgentId } from "../skills/types.js";

export interface CliArgs {
  skillsDir: string;
  backupDir: string | null;
  dryRun: boolean;
  json: boolean;
  agentId: AgentId;
}

export interface SkillResult {
  file: string;
  status: "changed" | "unchanged" | "skipped" | "error";
  reason: string;
}

export interface InstallReport {
  skills_dir: string;
  backup_dir: string | null;
  dry_run: boolean;
  agent_id: AgentId;
  scanned: number;
  counts: {
    changed: number;
    unchanged: number;
    skipped: number;
    error: number;
  };
  results: SkillResult[];
}

export function parseArgs(argv: readonly string[]): CliArgs {
  let skillsDir: string | null = null;
  let backupDir: string | null = null;
  let dryRun = false;
  let json = false;
  let agentId: string | null = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--skills-dir" && i + 1 < argv.length) {
      skillsDir = argv[i + 1] as string;
      i += 1;
    } else if (arg === "--backup-dir" && i + 1 < argv.length) {
      backupDir = argv[i + 1] as string;
      i += 1;
    } else if (arg === "--agent" && i + 1 < argv.length) {
      agentId = argv[i + 1] as string;
      i += 1;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--no-dry-run") {
      dryRun = false;
    } else if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        "Usage: engram-rag install-skills --skills-dir <path> --agent <id> " +
          "[--dry-run] [--backup-dir <path>] --json\n",
      );
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  if (skillsDir === null) {
    throw new Error("missing required --skills-dir <path>");
  }
  if (agentId === null) {
    throw new Error("missing required --agent <id> (e.g. sdd-apply)");
  }
  // Validate agent_id against the canonical Zod schema. The CLI is
  // the only place that touches user-supplied strings on the way into
  // the patcher, so this is the right enforcement boundary.
  const parsedAgent = AgentIdSchema.parse(agentId);
  return { skillsDir, backupDir, dryRun, json, agentId: parsedAgent };
}

/**
 * Recursively find every `SKILL.md` under `dir`. Returns absolute
 * paths. Symlinks are not followed (Node default) and hidden
 * directories are skipped so a `.git/` or `node_modules/` next to a
 * skill tree does not pollute the result.
 */
export function findSkillFiles(dir: string): string[] {
  const root = resolve(dir);
  if (!existsSync(root)) {
    return [];
  }
  const out: string[] = [];
  const stack: string[] = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    const stat = statSync(current);
    if (stat.isDirectory()) {
      const name = current.split(/[\\/]/).pop() ?? "";
      if (name.startsWith(".") && name !== ".") {
        // Skip dotfile directories (e.g. .git, .vscode).
        continue;
      }
      for (const entry of readdirSync(current)) {
        stack.push(join(current, entry));
      }
    } else if (stat.isFile()) {
      const base = current.split(/[\\/]/).pop() ?? "";
      if (base === "SKILL.md") {
        out.push(current);
      }
    }
  }
  return out.sort();
}

/**
 * Process a single skill file. Pure with respect to the file system:
 * reads the file, asks the patcher what would change, and either
 * writes the new content (with backup) or reports without writing.
 *
 * `skillsDir` is the directory the walk started from. It is used to
 * compute a relative backup path that is stable across `cwd` changes
 * (the CLI may be invoked from a different directory than the one
 * that holds the skills). For files inside `skillsDir` the backup is
 * `join(backupDir, timestamp, relative(skillsDir, file))`, which
 * preserves the on-disk layout of nested skills in the backup.
 *
 * In dry-run mode the function NEVER writes to `file` or to
 * `backupDir`. In write mode (`dryRun=false`) a backup is created
 * BEFORE the new content is written so a crash mid-write still leaves
 * a recoverable copy on disk.
 */
export function processSkill(
  skillsDir: string,
  file: string,
  agentId: AgentId,
  dryRun: boolean,
  backupDir: string | null,
  timestamp: string,
): SkillResult {
  const content = readFileSync(file, "utf8");
  const patched = patchSkill(content, agentId);
  const reportFile = relative(process.cwd(), file);
  if (!patched.changed) {
    return {
      file: reportFile,
      status: "unchanged",
      reason: patched.reason,
    };
  }
  if (dryRun) {
    return {
      file: reportFile,
      status: "skipped",
      reason: `dry-run: would apply (${patched.reason})`,
    };
  }
  try {
    if (backupDir !== null) {
      const backupPath = join(
        backupDir,
        timestamp,
        relative(skillsDir, file),
      );
      mkdirSync(dirname(backupPath), { recursive: true });
      copyFileSync(file, backupPath);
    }
    writeFileSync(file, patched.content, "utf8");
    return {
      file: reportFile,
      status: "changed",
      reason: patched.reason,
    };
  } catch (err) {
    return {
      file: reportFile,
      status: "error",
      reason: (err as Error).message,
    };
  }
}

export function runInstall(args: CliArgs): { report: InstallReport; exitCode: number } {
  if (!existsSync(args.skillsDir)) {
    throw new Error(`--skills-dir does not exist: ${args.skillsDir}`);
  }
  if (!args.dryRun && args.backupDir !== null && !existsSync(args.backupDir)) {
    mkdirSync(args.backupDir, { recursive: true });
  }
  const files = findSkillFiles(args.skillsDir);
  // One timestamp per run, so a single run's backups are easy to
  // identify and roll back as a unit.
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");

  const results: SkillResult[] = files.map((f) =>
    processSkill(args.skillsDir, f, args.agentId, args.dryRun, args.backupDir, timestamp),
  );

  const counts = { changed: 0, unchanged: 0, skipped: 0, error: 0 };
  for (const r of results) {
    counts[r.status] += 1;
  }

  const report: InstallReport = {
    skills_dir: args.skillsDir,
    backup_dir: args.backupDir,
    dry_run: args.dryRun,
    agent_id: args.agentId,
    scanned: results.length,
    counts,
    results,
  };

  const exitCode = counts.error > 0 ? 2 : 0;
  return { report, exitCode };
}

function printReport(report: InstallReport, json: boolean): string {
  if (json) {
    return JSON.stringify(report, null, 2) + "\n";
  }
  const c = report.counts;
  const lines: string[] = [
    `[install-skills] skills_dir=${report.skills_dir} ` +
      `agent=${report.agent_id} dry_run=${String(report.dry_run)} ` +
      `scanned=${report.scanned} changed=${c.changed} ` +
      `unchanged=${c.unchanged} skipped=${c.skipped} error=${c.error}`,
  ];
  for (const r of report.results) {
    if (r.status === "unchanged") continue;
    lines.push(`  ${r.status.padEnd(9)} ${r.file} (${r.reason})`);
  }
  return lines.join("\n") + "\n";
}

/**
 * In-process entry point used by tests and the bin shim. Returns the
 * structured result instead of touching `process.exit`, so callers
 * (including vitest) can assert on `exitCode`, `stdout`, and `stderr`.
 */
export function runInstallCli(argv: readonly string[]): {
  exitCode: number;
  stdout: string;
  stderr: string;
} {
  let args: CliArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `error: ${(err as Error).message}\n`,
    };
  }

  let report: InstallReport;
  let exitCode: number;
  try {
    const result = runInstall(args);
    report = result.report;
    exitCode = result.exitCode;
  } catch (err) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `error: ${(err as Error).message}\n`,
    };
  }

  return {
    exitCode,
    stdout: printReport(report, args.json),
    stderr: "",
  };
}

function main(): void {
  const result = runInstallCli(process.argv.slice(2));
  if (result.stdout.length > 0) process.stdout.write(result.stdout);
  if (result.stderr.length > 0) process.stderr.write(result.stderr);
  process.exit(result.exitCode);
}

const __filename = fileURLToPath(import.meta.url);

if (resolve(process.argv[1] ?? "") === __filename) {
  main();
}
