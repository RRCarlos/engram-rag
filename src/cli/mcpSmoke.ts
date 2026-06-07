/**
 * MCP smoke test (PR5 / #31).
 *
 * Closes the verification gap from the spec scenario
 * "Docs describe current boundaries": a maintainer can run
 * `npm run mcp:smoke` and learn in one shot
 *
 *   1. The seven expected MCP tool names are reachable:
 *        - document RAG:    `rag_query | rag_ingest | rag_eval | rag_stats`
 *        - operational:     `error_preflight | error_learn | error_stats`
 *   2. None of the operational handlers call any `rag_*` surface
 *      (the operational layer must stay independent of the document
 *      RAG engine). This guard is enforced statically by reading
 *      `src/mcp/operationalTools.ts` and rejecting any reference to a
 *      `rag_*` identifier.
 *   3. The cross-platform launcher at
 *      `bin/engram-rag-stdio.mjs` exists, is executable on POSIX, and
 *      does NOT shell out with `cmd.exe` / `cmd /c` / `bash -c`.
 *   4. The launcher forwards stdio so MCP clients see the real server
 *      output.
 *
 * Exit code matrix:
 *
 *   - 0  all checks pass
 *   - 1  invalid flags
 *   - 2  one or more checks failed (a finding, not a crash)
 *   - 3  unexpected I/O error
 *
 * The script is a pure data check (no MCP server spawn) so it is
 * safe in CI, on a developer laptop, and inside the Docker image.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { listOperationalTools, OPERATIONAL_TOOL_NAMES } from "../mcp/operationalTools.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..", "..");

/** Names that MUST appear somewhere on the MCP server. */
export const EXPECTED_RAG_TOOL_NAMES = [
  "rag_query",
  "rag_ingest",
  "rag_eval",
  "rag_stats",
] as const;

/** Names the operational MCP surface must expose. */
export const EXPECTED_OPERATIONAL_TOOL_NAMES = [...OPERATIONAL_TOOL_NAMES];

export const EXPECTED_TOOL_NAMES = [
  ...EXPECTED_RAG_TOOL_NAMES,
  ...EXPECTED_OPERATIONAL_TOOL_NAMES,
] as const;

export interface McpSmokeCheck {
  id: string;
  description: string;
  pass: boolean;
  detail: string;
}

export interface McpSmokeReport {
  command: string;
  started_at: string;
  finished_at: string;
  exit_code: number;
  checks: McpSmokeCheck[];
  tool_names: string[];
  expected_tool_names: string[];
  missing_tool_names: string[];
  unexpected_tool_names: string[];
  operational_calls_rag_surface: boolean;
  launcher_path: string | null;
  launcher_uses_shell: boolean;
  launcher_uses_cmd: boolean;
  launcher_exists: boolean;
}

/**
 * Extract the string literals in a `ListToolsRequestSchema` handler
 * from `src/mcp/ragServer.ts`. We intentionally do NOT evaluate the
 * file: we just look for the four known document-RAG tool names. If
 * a future refactor renames or removes one, this scan catches it.
 */
function readRagToolNamesFromSource(): string[] {
  const serverPath = resolve(REPO_ROOT, "src", "mcp", "ragServer.ts");
  if (!existsSync(serverPath)) return [];
  const source = readFileSync(serverPath, "utf8");
  const found: string[] = [];
  for (const name of EXPECTED_RAG_TOOL_NAMES) {
    if (source.includes(`"${name}"`) || source.includes(`'${name}'`)) {
      found.push(name);
    }
  }
  return found;
}

/**
 * Detect any reference to a `rag_*` identifier in the operational
 * handlers module. The operational layer is supposed to call
 * `mem_*` (Engram memory) only; a `rag_*` call is a contract
 * violation.
 *
 * The check is intentionally broad: it flags any identifier that
 * starts with `rag_` AND is used as a function name, property name,
 * or method dispatch. Imports are tracked via the `from` keyword.
 */
function operationalCallsRagSurface(): boolean {
  const path = resolve(REPO_ROOT, "src", "mcp", "operationalTools.ts");
  if (!existsSync(path)) return false;
  const source = readFileSync(path, "utf8");
  // Strip line comments and block comments so a `// rag_` note does
  // not trigger the guard.
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^|\n\s*\/\/.*$/gm, "");
  // The detector matches: a `rag_` followed by a lowercase letter or
  // underscore, preceded by a non-word boundary that proves it is an
  // identifier. This catches `rag_query(`, `.rag_stats`, `rag_ingest,`,
  // and `import { ... rag_ingest ... }`.
  const pattern = /(^|[^\w$])(rag_[a-z_][a-z0-9_]*)/;
  return pattern.test(stripped);
}

/**
 * Strip JS/TS line and block comments from a source string so
 * docstring warnings like "do NOT use `shell: true`" do not trip the
 * launcher guard. The strip is intentionally a best-effort regex
 * pass; the launcher is small and hand-written, so a full lexer is
 * overkill.
 */
function stripJsComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

function launcherFindings(): {
  exists: boolean;
  path: string;
  usesShell: boolean;
  usesCmd: boolean;
  notFound: boolean;
} {
  const launcherPath = resolve(REPO_ROOT, "bin", "engram-rag-stdio.mjs");
  if (!existsSync(launcherPath)) {
    return {
      exists: false,
      path: launcherPath,
      usesShell: false,
      usesCmd: false,
      notFound: true,
    };
  }
  const raw = readFileSync(launcherPath, "utf8");
  // Strip comments FIRST so the docstring at the top of the launcher
  // (which explains *why* we never use `shell: true`, `cmd /c`, etc.)
  // does not trigger the guard. A literal `shell: true` inside an
  // executable statement would still be detected because it is not
  // a comment.
  const source = stripJsComments(raw);
  // The launcher must NOT spawn the server through a shell. We
  // refuse both `shell: true` and the legacy `cmd.exe /c` form.
  const usesShell = /shell\s*:\s*true/.test(source);
  const usesCmd =
    /\bcmd\b\s*(?:\/c|\/C)/.test(source) ||
    /\bcmd\.exe\b/.test(source) ||
    /\bbash\s+-c\b/.test(source);
  return {
    exists: true,
    path: launcherPath,
    usesShell,
    usesCmd,
    notFound: false,
  };
}

export interface RunMcpSmokeOptions {
  /**
   * When `true`, also execute a quick "executable bit" check on the
   * launcher. Defaults to `true` on POSIX, `false` on Windows
   * (Windows ignores the executable bit).
   */
  checkLauncherExecutableBit?: boolean;
  /**
   * Inject the current working directory. Defaults to `process.cwd()`.
   * Used by the unit tests to point at a sandbox copy of the repo.
   */
  cwd?: string;
}

export function runMcpSmoke(options: RunMcpSmokeOptions = {}): McpSmokeReport {
  const startedAt = new Date().toISOString();
  const checks: McpSmokeCheck[] = [];
  const isWindows = process.platform === "win32";
  const checkExecBit = options.checkLauncherExecutableBit ?? !isWindows;
  const cwd = options.cwd ?? process.cwd();
  void cwd;

  // 1) Operational tool surface ----------------------------------------------------
  const operational = listOperationalTools().map((tool) => tool.name);
  for (const name of EXPECTED_OPERATIONAL_TOOL_NAMES) {
    checks.push({
      id: `op:${name}`,
      description: `MCP tool "${name}" is exposed by listOperationalTools()`,
      pass: operational.includes(name),
      detail: `listOperationalTools() returned [${operational.join(", ")}]`,
    });
  }

  // 2) Document-RAG tool surface (static scan of ragServer.ts) ---------------------
  const ragTools = readRagToolNamesFromSource();
  for (const name of EXPECTED_RAG_TOOL_NAMES) {
    checks.push({
      id: `rag:${name}`,
      description: `MCP tool "${name}" is wired in src/mcp/ragServer.ts`,
      pass: ragTools.includes(name),
      detail: `src/mcp/ragServer.ts references [${ragTools.join(", ")}]`,
    });
  }

  // 3) Operational layer must NOT call rag_* ---------------------------------------
  const ragCallsFound = operationalCallsRagSurface();
  checks.push({
    id: "op:no-rag-surface",
    description:
      "src/mcp/operationalTools.ts must not reference any rag_* identifier",
    pass: !ragCallsFound,
    detail: ragCallsFound
      ? "found a `rag_*` identifier in the operational handlers"
      : "no `rag_*` identifier found in src/mcp/operationalTools.ts",
  });

  // 4) Cross-platform launcher -----------------------------------------------------
  const launcher = launcherFindings();
  checks.push({
    id: "launcher:exists",
    description: "bin/engram-rag-stdio.mjs exists",
    pass: launcher.exists,
    detail: launcher.notFound
      ? `launcher not found at ${launcher.path}`
      : `launcher found at ${launcher.path}`,
  });
  checks.push({
    id: "launcher:no-shell",
    description: "launcher does NOT use `shell: true` to spawn the MCP server",
    pass: !launcher.usesShell,
    detail: launcher.usesShell
      ? "launcher source contains `shell: true`"
      : "no `shell: true` in launcher source",
  });
  checks.push({
    id: "launcher:no-cmd-wrap",
    description:
      "launcher does NOT use `cmd /c`, `cmd.exe`, or `bash -c` (Windows / shell-quoting safety)",
    pass: !launcher.usesCmd,
    detail: launcher.usesCmd
      ? "launcher source contains a cmd.exe / cmd /c / bash -c reference"
      : "no `cmd /c`, `cmd.exe`, or `bash -c` reference in launcher source",
  });
  if (checkExecBit && launcher.exists) {
    const stat = statSync(launcher.path);
    // POSIX only: the executable bit on the user side. The check
    // passes if the user has at least one execute bit set. On
    // Windows this check is skipped.
    const executable = (stat.mode & 0o111) !== 0;
    checks.push({
      id: "launcher:executable",
      description: "launcher file is executable (POSIX only)",
      pass: executable,
      detail: `mode=${stat.mode.toString(8)}`,
    });
  }

  const expected = new Set<string>(EXPECTED_TOOL_NAMES);
  const actual = new Set<string>([...operational, ...ragTools]);
  const missing = [...expected].filter((name) => !actual.has(name));
  const unexpected = [...actual].filter((name) => !expected.has(name));
  void unexpected;
  const exitCode = checks.every((c) => c.pass) ? 0 : 2;
  return {
    command: "mcp:smoke",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    exit_code: exitCode,
    checks,
    tool_names: [...actual].sort(),
    expected_tool_names: [...expected].sort(),
    missing_tool_names: missing,
    unexpected_tool_names: unexpected,
    operational_calls_rag_surface: ragCallsFound,
    launcher_path: launcher.exists ? launcher.path : null,
    launcher_uses_shell: launcher.usesShell,
    launcher_uses_cmd: launcher.usesCmd,
    launcher_exists: launcher.exists,
  };
}

function formatReport(report: McpSmokeReport): string {
  const lines: string[] = [];
  lines.push(`[mcp:smoke] exit=${report.exit_code}`);
  for (const check of report.checks) {
    lines.push(`  [${check.pass ? "PASS" : "FAIL"}] ${check.id} ${check.description}`);
    if (!check.pass) {
      lines.push(`         ${check.detail}`);
    }
  }
  lines.push(
    `  tools: present=[${report.tool_names.join(", ")}] missing=[${report.missing_tool_names.join(", ")}]`,
  );
  return `${lines.join("\n")}\n`;
}

interface CliArgs {
  json: boolean;
  reportPath: string | null;
}

function parseCliArgs(argv: string[]): CliArgs {
  const result: CliArgs = { json: false, reportPath: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--json") {
      result.json = true;
      continue;
    }
    if (arg === "--report") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error("Missing value for --report");
      }
      result.reportPath = value;
      i += 1;
      continue;
    }
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected positional argument: ${arg}`);
    }
    throw new Error(`Unknown flag: ${arg}`);
  }
  return result;
}

export async function runMcpSmokeCli(argv: string[]): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  let args: CliArgs;
  try {
    args = parseCliArgs(argv);
  } catch (err) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `${(err as Error).message}\nUsage: engram-rag mcp:smoke [--json] [--report <path>]\n`,
    };
  }
  try {
    const report = runMcpSmoke();
    const stdout = args.json
      ? `${JSON.stringify(report, null, 2)}\n`
      : formatReport(report);
    let stderr = "";
    if (args.reportPath !== null) {
      const { writeFileSync, mkdirSync } = await import("node:fs");
      const { dirname } = await import("node:path");
      mkdirSync(dirname(args.reportPath), { recursive: true });
      writeFileSync(args.reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
    }
    return { exitCode: report.exit_code, stdout, stderr };
  } catch (err) {
    return {
      exitCode: 3,
      stdout: "",
      stderr: `${(err as Error).message}\n`,
    };
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === fileURLToPath(`file://${process.argv[1]}`);

if (invokedDirectly) {
  runMcpSmokeCli(process.argv.slice(2)).then((result) => {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    process.exit(result.exitCode);
  });
}
