import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const BEGIN_MARKER = "<!-- ENGRAM_RAG_LIVE_PREFLIGHT_START -->";
const END_MARKER = "<!-- ENGRAM_RAG_LIVE_PREFLIGHT_END -->";

export interface PatchLiveSkillsArgs {
  skillDir: string;
  dryRun: boolean;
  json: boolean;
}

export interface PatchLiveSkillResult {
  file: string;
  status: "changed" | "unchanged" | "skipped" | "error";
  reason: string;
}

export interface PatchLiveSkillsReport {
  skill_dir: string;
  dry_run: boolean;
  scanned: number;
  counts: Record<PatchLiveSkillResult["status"], number>;
  results: PatchLiveSkillResult[];
}

function usage(): string {
  return [
    "Usage: engram-rag patch-live-skills --skill-dir <path> [--dry-run] [--json]",
    "Patches sdd-*/SKILL.md files with live Engram preflight instructions.",
  ].join("\n");
}

export function parsePatchLiveSkillsArgs(argv: readonly string[]): PatchLiveSkillsArgs {
  let skillDir: string | undefined;
  let dryRun = false;
  let json = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--skill-dir") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("missing value for --skill-dir");
      skillDir = value;
      i += 1;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--help" || arg === "-h") {
      throw new Error(usage());
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  if (skillDir === undefined) throw new Error("missing required --skill-dir");
  return { skillDir: resolve(skillDir), dryRun, json };
}

export function findSddSkillFiles(skillDir: string): string[] {
  const root = resolve(skillDir);
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    const stat = statSync(current);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(current)) {
        if (entry === "node_modules" || entry === ".git") continue;
        stack.push(join(current, entry));
      }
    } else if (stat.isFile() && basename(current) === "SKILL.md") {
      const parent = basename(resolve(current, ".."));
      if (/^sdd-[a-z0-9-]+$/.test(parent)) out.push(current);
    }
  }
  return out.sort();
}

function renderLivePreflightBlock(): string {
  return [
    BEGIN_MARKER,
    "## Live Engram preflight",
    "",
    "Before relevant shell, write, spec, design, verify, or archive actions, run live preflight from the `engram-rag` repository:",
    "",
    "```bash",
    "node --import tsx src/cli/preflightLive.ts --project <project> --agent <sdd-agent> --task <task text> --action <read|write|shell|spec|design|verify|review> --cwd <repo path>",
    "```",
    "",
    "Use `--shell powershell` or `--shell bash` for shell work. If the result has `applied_rules`, follow those rules before acting. If `missing_expected_records` is not empty, treat the preflight as incomplete and recover the missing context before continuing. If `degraded` is `true`, continue only when the action is safe without retrieved memory; otherwise stop and report the degraded preflight.",
    END_MARKER,
    "",
  ].join("\n");
}

export function patchLiveSkillContent(content: string): { content: string; changed: boolean; reason: string } {
  const normalized = content.replace(/\r\n/g, "\n");
  const fresh = renderLivePreflightBlock();
  const blockRe = new RegExp(`${BEGIN_MARKER}[\\s\\S]*?${END_MARKER}\\n?`);
  const existing = normalized.match(blockRe);
  if (existing !== null) {
    const next = normalized.replace(blockRe, fresh);
    return next === normalized
      ? { content: normalized, changed: false, reason: "block already up to date" }
      : { content: next, changed: true, reason: "replaced existing live preflight block" };
  }
  const fmMatch = normalized.match(/^---\n[\s\S]*?\n---\n?/);
  if (fmMatch === null) {
    return { content, changed: false, reason: "no frontmatter: skipped for safety" };
  }
  const insertAt = fmMatch[0].length;
  const separator = normalized.slice(insertAt).startsWith("\n") ? "" : "\n";
  return {
    content: normalized.slice(0, insertAt) + separator + fresh + normalized.slice(insertAt),
    changed: true,
    reason: "inserted live preflight block after frontmatter",
  };
}

function processFile(file: string, dryRun: boolean): PatchLiveSkillResult {
  const reportFile = relative(process.cwd(), file).split("\\").join("/");
  try {
    const content = readFileSync(file, "utf8");
    const patched = patchLiveSkillContent(content);
    if (!patched.changed) return { file: reportFile, status: "unchanged", reason: patched.reason };
    if (dryRun) return { file: reportFile, status: "skipped", reason: `dry-run: would apply (${patched.reason})` };
    writeFileSync(file, patched.content, "utf8");
    return { file: reportFile, status: "changed", reason: patched.reason };
  } catch (error) {
    return { file: reportFile, status: "error", reason: (error as Error).message };
  }
}

export function runPatchLiveSkills(args: PatchLiveSkillsArgs): { report: PatchLiveSkillsReport; exitCode: number } {
  if (!existsSync(args.skillDir)) throw new Error(`--skill-dir does not exist: ${args.skillDir}`);
  const files = findSddSkillFiles(args.skillDir);
  const results = files.map((file) => processFile(file, args.dryRun));
  const counts = { changed: 0, unchanged: 0, skipped: 0, error: 0 };
  for (const result of results) counts[result.status] += 1;
  return {
    report: { skill_dir: args.skillDir, dry_run: args.dryRun, scanned: results.length, counts, results },
    exitCode: counts.error > 0 ? 2 : 0,
  };
}

function formatReport(report: PatchLiveSkillsReport, json: boolean): string {
  if (json) return `${JSON.stringify(report, null, 2)}\n`;
  const c = report.counts;
  return [
    `[patch-live-skills] skill_dir=${report.skill_dir} dry_run=${String(report.dry_run)} scanned=${report.scanned} changed=${c.changed} unchanged=${c.unchanged} skipped=${c.skipped} error=${c.error}`,
    ...report.results.filter((r) => r.status !== "unchanged").map((r) => `  ${r.status.padEnd(9)} ${r.file} (${r.reason})`),
  ].join("\n") + "\n";
}

export function runPatchLiveSkillsCli(argv: readonly string[]): { exitCode: number; stdout: string; stderr: string } {
  let args: PatchLiveSkillsArgs;
  try {
    args = parsePatchLiveSkillsArgs(argv);
  } catch (error) {
    return { exitCode: 1, stdout: "", stderr: `error: ${(error as Error).message}\n${usage()}\n` };
  }
  try {
    const { report, exitCode } = runPatchLiveSkills(args);
    return { exitCode, stdout: formatReport(report, args.json), stderr: "" };
  } catch (error) {
    return { exitCode: 1, stdout: "", stderr: `error: ${(error as Error).message}\n` };
  }
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const result = runPatchLiveSkillsCli(process.argv.slice(2));
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}
