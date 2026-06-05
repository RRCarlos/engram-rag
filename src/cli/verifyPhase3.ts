/**
 * Phase 3 verify script.
 *
 * Runs the test suite, walks every `*.md` under `test/fixtures/skills/`,
 * and confirms:
 *
 *   1. The Phase 3 source artifacts exist (the renderer, patcher,
 *      verifier, install CLI, verify CLI, and their test files).
 *   2. Every fixture whose filename starts with a valid `AgentId`
 *      (e.g. `sdd-apply-*.md`) verifies cleanly with that agent.
 *      Fixtures whose filename does NOT start with a valid agent
 *      (e.g. `no-frontmatter.md`, `wrong-topic.md`) are expected to
 *      fail verification — the report tracks them but does not fail
 *      the overall gate on them.
 *   3. A dry-run of `install-skills` against the fixture directory
 *      does not modify any file. This is the closure check for the
 *      "dry-run no escribe archivos" acceptance gate from
 *      `rag-system/v2/design.md` §5.
 *
 * The report is written to `reports/phase3/verify-report.json` with
 * the same schema as `verify:phase1` / `verify:phase2`, plus two
 * Phase-3-specific metrics: `dry_run_idempotent` and a per-fixture
 * `expected_pass` vs `actual_pass` tally.
 *
 * Exit code is 0 only when every check passes. The script never
 * short-circuits: even on failure the report is written so reviewers
 * can see the gap.
 */

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifySkill } from "../skills/verifySkill.js";
import { AgentIdSchema, type AgentId } from "../skills/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..", "..");
const REPORT_PATH = resolve(REPO_ROOT, "reports/phase3/verify-report.json");
const FIXTURE_DIR = resolve(REPO_ROOT, "test/fixtures/skills");

const ARTIFACTS = [
  "src/skills/renderRagBlock.ts",
  "src/skills/patchSkill.ts",
  "src/skills/verifySkill.ts",
  "src/skills/types.ts",
  "src/cli/installSkills.ts",
  "src/cli/verifyPhase3.ts",
  "test/skills/renderRagBlock.test.ts",
  "test/skills/patchSkill.test.ts",
  "test/skills/verifySkill.test.ts",
  "test/fixtures/skills/sdd-apply-clean.md",
  "test/fixtures/skills/sdd-apply-patched.md",
  "test/fixtures/skills/no-frontmatter.md",
  "test/fixtures/skills/wrong-topic.md",
];

interface VitestJson {
  numPassedTests?: number;
  numFailedTests?: number;
  numTotalTests?: number;
  success?: boolean;
}

interface FixtureCheck {
  file: string;
  expected_pass: boolean;
  actual_pass: boolean | null;
  agent_id: AgentId | null;
  reason: string;
}

interface VerifyReport {
  command: string;
  exit_code: number;
  started_at: string;
  finished_at: string;
  tests_passed: number;
  tests_failed: number;
  artifacts_checked: string[];
  metrics: {
    total_tests: number;
    artifacts_missing: string[];
    canonical_topic_key: string;
    fixtures_total: number;
    fixtures_expected_pass: number;
    fixtures_actual_pass: number;
    dry_run_idempotent: boolean;
    dry_run_note: string;
  };
  fixtures: FixtureCheck[];
}

function parseVitestJson(raw: string): VitestJson {
  let parsed: VitestJson = {};
  for (const line of raw.trim().split(/\r?\n/)) {
    try {
      const candidate = JSON.parse(line) as VitestJson;
      if (typeof candidate.numPassedTests === "number") {
        parsed = candidate;
      }
    } catch {
      // Vitest prints non-JSON status lines around the summary.
    }
  }
  return parsed;
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function listSkillFixtures(): string[] {
  if (!existsSync(FIXTURE_DIR)) return [];
  return readdirSync(FIXTURE_DIR)
    .filter((name) => name.endsWith(".md"))
    .filter((name) => statSync(resolve(FIXTURE_DIR, name)).isFile())
    .sort();
}

function deriveAgentFromFilename(file: string): AgentId | null {
  for (const id of AgentIdSchema.options) {
    if (file.startsWith(`${id}-`) || file.startsWith(`${id}.`)) {
      return id;
    }
  }
  return null;
}

function checkFixtures(): FixtureCheck[] {
  if (!existsSync(FIXTURE_DIR)) return [];
  const files = listSkillFixtures().map((name) => resolve(FIXTURE_DIR, name));

  const out: FixtureCheck[] = [];
  for (const file of files) {
    const base = file.split(/[\\/]/).pop() ?? file;
    const agentId = deriveAgentFromFilename(base);
    if (agentId === null) {
      out.push({
        file: base,
        expected_pass: false,
        actual_pass: null,
        agent_id: null,
        reason: "filename does not start with a valid AgentId; verification not applicable",
      });
      continue;
    }
    const content = readFileSync(file, "utf8");
    // A fixture is expected to pass verification only if it ALREADY
    // carries a real RAG block. The substring `<!-- ENGRAM_RAG_BLOCK_START`
    // alone is not enough: a fixture's prose may mention the block
    // by name (e.g. in a "Notes" section) without actually carrying
    // one. The verifier requires the START comment to include an
    // `agent=` attribute, so we look for the same marker.
    const hasBlock = /<!-- ENGRAM_RAG_BLOCK_START\s+agent=/.test(content);
    if (!hasBlock) {
      out.push({
        file: base,
        expected_pass: false,
        actual_pass: verifySkill(content, agentId).ok,
        agent_id: agentId,
        reason: "no RAG block present; verification not expected to pass",
      });
      continue;
    }
    const result = verifySkill(content, agentId);
    out.push({
      file: base,
      expected_pass: true,
      actual_pass: result.ok,
      agent_id: agentId,
      reason: result.ok
        ? "ok"
        : result.errors.join("; ") || "verifier reported errors",
    });
  }
  return out;
}

function checkDryRunIdempotent(): { idempotent: boolean; note: string } {
  if (!existsSync(FIXTURE_DIR)) {
    return { idempotent: true, note: "fixture dir missing; skipped" };
  }
  // Hash every fixture file before invoking install-skills.
  const before: Record<string, string> = {};
  for (const name of readdirSync(FIXTURE_DIR)) {
    if (!name.endsWith(".md")) continue;
    const p = resolve(FIXTURE_DIR, name);
    if (!statSync(p).isFile()) continue;
    before[name] = sha256(readFileSync(p, "utf8"));
  }

  let stderr = "";
  try {
    execSync(
      `node --import tsx src/cli/installSkills.ts --skills-dir "${FIXTURE_DIR}" --agent sdd-apply --dry-run --json`,
      {
        cwd: REPO_ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch (err) {
    stderr = (err as { stderr?: string }).stderr ?? "";
  }

  // Hash every fixture file after the dry-run. If the dry-run
  // accidentally wrote something, the hashes will have changed and
  // the closure check fails.
  const after: Record<string, string> = {};
  for (const name of Object.keys(before)) {
    after[name] = sha256(readFileSync(resolve(FIXTURE_DIR, name), "utf8"));
  }
  const changed: string[] = [];
  for (const name of Object.keys(before)) {
    if (before[name] !== after[name]) {
      changed.push(name);
    }
  }
  if (changed.length === 0) {
    return { idempotent: true, note: "all fixture hashes unchanged after dry-run" };
  }
  return {
    idempotent: false,
    note: `dry-run modified: ${changed.join(", ")}${stderr ? `; stderr: ${stderr.trim()}` : ""}`,
  };
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const command = "npm test -- --reporter=json";

  let exitCode = 0;
  let testsPassed = 0;
  let testsFailed = 0;
  let totalTests = 0;

  try {
    const raw = execSync(
      "npx vitest run --reporter=json --exclude \"test/cli/verifyPhase*.test.ts\"",
      {
        cwd: REPO_ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const parsed = parseVitestJson(raw);
    totalTests = parsed.numTotalTests ?? 0;
    testsPassed = parsed.numPassedTests ?? 0;
    testsFailed = parsed.numFailedTests ?? 0;
    if (parsed.success === false) exitCode = 1;
  } catch (error) {
    const err = error as { status?: number | null; stdout?: string };
    exitCode = err.status ?? 1;
    const parsed = parseVitestJson(err.stdout ?? "");
    totalTests = parsed.numTotalTests ?? 0;
    testsPassed = parsed.numPassedTests ?? 0;
    testsFailed = parsed.numFailedTests ?? 0;
  }

  const artifactsMissing = ARTIFACTS.filter(
    (rel) => !existsSync(resolve(REPO_ROOT, rel)),
  );

  const fixtures = checkFixtures();
  const dryRun = checkDryRunIdempotent();

  let fixturesActualPass = 0;
  for (const f of fixtures) {
    if (f.expected_pass && f.actual_pass === true) fixturesActualPass += 1;
  }

  // Phase 3 closure: every expected_pass fixture must pass, and the
  // dry-run must be byte-idempotent. Test failures already set
  // exitCode; artifact gaps and fixture gaps layer on top.
  if (artifactsMissing.length > 0) exitCode = 1;
  if (fixturesActualPass < fixtures.filter((f) => f.expected_pass).length) exitCode = 1;
  if (!dryRun.idempotent) exitCode = 1;

  const report: VerifyReport = {
    command,
    exit_code: exitCode,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    tests_passed: testsPassed,
    tests_failed: testsFailed,
    artifacts_checked: ARTIFACTS,
    metrics: {
      total_tests: totalTests,
      artifacts_missing: artifactsMissing,
      canonical_topic_key: "engram-rag/agent-rigor-protocol/v2",
      fixtures_total: fixtures.length,
      fixtures_expected_pass: fixtures.filter((f) => f.expected_pass).length,
      fixtures_actual_pass: fixturesActualPass,
      dry_run_idempotent: dryRun.idempotent,
      dry_run_note: dryRun.note,
    },
    fixtures,
  };

  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");

  process.stdout.write(
    `[verify:phase3] exit=${exitCode} passed=${testsPassed} failed=${testsFailed} ` +
      `fixtures_actual_pass=${fixturesActualPass}/${fixtures.filter((f) => f.expected_pass).length} ` +
      `dry_run_idempotent=${String(dryRun.idempotent)} ` +
      `artifacts_missing=${artifactsMissing.length} report=${REPORT_PATH}\n`,
  );

  process.exit(exitCode);
}

void main();
