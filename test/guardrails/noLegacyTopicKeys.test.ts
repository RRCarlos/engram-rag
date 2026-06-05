import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { FORBIDDEN_TOPIC_ALIASES } from "../../src/contracts/topicKeys.js";

/**
 * Guardrail: every text file in active code, fixtures, and skill
 * blocks MUST NOT contain a forbidden v1 topic alias. The only
 * allowed exception is the forensic evidence file, which is marked
 * as historical and referenced from the policy tests.
 */

const REPO_ROOT = resolve(__dirname, "..", "..");
const ALLOWED_EXCEPTIONS = new Set<string>([
  // Path relative to repo root, using forward slashes.
  // The forensic evidence file is the historical baseline and MUST
  // contain the v1 aliases as citations.
  "docs/evidence/v1-forensics.md",
  // The policy source itself defines the forbidden list. It is the
  // single source of truth, so the guardrail must allow it.
  "src/contracts/topicKeys.ts",
  // The guardrail test itself references the policy import; the
  // literal forbidden strings are the thing being checked, so the
  // test file is allowed to import the constant array. The actual
  // strings live in the policy file above.
  "test/guardrails/noLegacyTopicKeys.test.ts",
  // Phase 3: the verifier test exercises forbidden-alias detection,
  // so the test file must be allowed to mention the alias literals.
  "test/skills/verifySkill.test.ts",
  // Phase 3: the renderer test asserts that the block body does NOT
  // echo the alias literals; doing that assertion requires the test
  // file to mention the strings (inside `not.toContain(...)` calls).
  "test/skills/renderRagBlock.test.ts",
  // Phase 4: the acceptance doc and its docs test enumerate the
  // forbidden aliases so reviewers and downstream agents know what
  // the G4 gate checks against. The contract is meaningful only if
  // the literal aliases are present, similar to v1-forensics.md.
  "docs/phase4-acceptance.md",
  "test/docs/phase4-acceptance.test.ts",
  // Phase 3 fixture: a hand-written SKILL.md whose RAG block carries
  // a forbidden v1 topic tag on purpose, to assert the verifier
  // rejects it. The fixture cannot be rewritten without losing the
  // thing it is testing.
  "test/fixtures/skills/wrong-topic.md",
]);

const SCAN_ROOTS = [
  "src",
  "test",
  "fixtures",
  "docs",
  ".github",
];

const SCAN_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".cjs",
  ".mjs",
  ".json",
  ".md",
  ".yml",
  ".yaml",
]);

function listFiles(root: string): string[] {
  const absolute = resolve(REPO_ROOT, root);
  if (!existsSync(absolute)) {
    return [];
  }
  const out: string[] = [];
  const stack: string[] = [absolute];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    const stat = statSync(current);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(current)) {
        if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) {
          // Skip node_modules, dist, and dotfile directories. We do
          // still walk `.github` because it is a scan root.
          if (entry !== ".github") {
            continue;
          }
        }
        stack.push(join(current, entry));
      }
    } else if (stat.isFile()) {
      const rel = relative(REPO_ROOT, current).split("\\").join("/");
      if (rel.startsWith(".github/")) {
        // We only want the workflows folder.
        const parts = rel.split("/");
        if (parts[1] !== "workflows") continue;
      }
      if (SCAN_EXTENSIONS.has(extname(current))) {
        out.push(rel);
      }
    }
  }
  return out;
}

describe("noLegacyTopicKeys", () => {
  const files = SCAN_ROOTS.flatMap((root) => listFiles(root));

  it("scans at least one file (sanity check)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("file %s contains no forbidden v1 topic alias", (relPath) => {
    if (ALLOWED_EXCEPTIONS.has(relPath)) {
      return;
    }
    const content = readFileSync(resolve(REPO_ROOT, relPath), "utf8");
    for (const alias of FORBIDDEN_TOPIC_ALIASES) {
      if (content.includes(alias)) {
        throw new Error(
          `Forbidden v1 topic alias "${alias}" found in ${relPath}. ` +
            `Move the citation to docs/evidence/v1-forensics.md or replace with the canonical key.`,
        );
      }
    }
    expect(true).toBe(true);
  });

  it("keeps the forensic evidence file as the only allowed exception", () => {
    // Self-check: the forensic file MUST contain at least one alias
    // so the exception list is doing real work, not just being a
    // blanket allow.
    const content = readFileSync(
      resolve(REPO_ROOT, "docs/evidence/v1-forensics.md"),
      "utf8",
    );
    const found = FORBIDDEN_TOPIC_ALIASES.filter((a) => content.includes(a));
    expect(found.length).toBeGreaterThan(0);
  });
});
