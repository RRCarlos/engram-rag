import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

const REPO_ROOT = resolve(__dirname, "..", "..");
const DOC_PATH = resolve(REPO_ROOT, "docs/phase1-acceptance.md");
const REPORT_PATH = resolve(REPO_ROOT, "reports/phase1/verify-report.json");

function readDoc(): string {
  return readFileSync(DOC_PATH, "utf8");
}

describe("phase1-acceptance", () => {
  it("exists and is non-empty", () => {
    const doc = readDoc();
    expect(doc.length).toBeGreaterThan(200);
  });

  it("requires npm test", () => {
    expect(readDoc()).toMatch(/npm test/);
  });

  it("requires npm run verify:phase1", () => {
    expect(readDoc()).toMatch(/npm run verify:phase1/);
  });

  it("requires the JSON report to exist", () => {
    expect(readDoc()).toContain("reports/phase1/verify-report.json");
  });

  it("references the design schema fields for the report", () => {
    const doc = readDoc();
    for (const field of [
      "command",
      "exit_code",
      "started_at",
      "finished_at",
      "tests_passed",
      "tests_failed",
      "artifacts_checked",
      "metrics",
    ]) {
      expect(doc).toContain(field);
    }
  });

  it("forbids declaring Phase 1 done without a passing verify report", () => {
    const doc = readDoc().toLowerCase();
    expect(doc).toContain("forbidden");
  });

  it("if a verify report has been emitted, it is parseable and green", () => {
    // This is a conditional check: we don't want to fail when the
    // report has not been generated yet, but if it has, it must
    // match the design schema and show zero failures.
    if (!existsSync(REPORT_PATH)) {
      return;
    }
    const report = JSON.parse(readFileSync(REPORT_PATH, "utf8"));
    expect(report.exit_code).toBe(0);
    expect(report.tests_failed).toBe(0);
    expect(report.metrics.canonical_topic_key).toBe(
      "engram-rag/agent-rigor-protocol/v2",
    );
  });
});
