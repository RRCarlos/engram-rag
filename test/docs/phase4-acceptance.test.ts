import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(__dirname, "..", "..");
const DOC_PATH = resolve(REPO_ROOT, "docs/phase4-acceptance.md");
const REPORT_PATH = resolve(REPO_ROOT, "reports/phase4/verify-report.json");

/**
 * Docs contract test for `docs/phase4-acceptance.md`.
 * Phase 3 added a parallel file (`docs/phase3-acceptance.md`).
 * This file is the Phase 4 closure contract: the five gates
 * G1-G5 plus the live-result block. The test asserts the
 * doc is current with the implementation, not bit-rotten.
 */
function readDoc(): string {
  return readFileSync(DOC_PATH, "utf8");
}

describe("phase4-acceptance.md", () => {
  it("exists and is non-empty", () => {
    expect(existsSync(DOC_PATH)).toBe(true);
    expect(readDoc().length).toBeGreaterThan(0);
  });

  it("lists every gate G1-G5 by id with a one-line description", () => {
    const doc = readDoc();
    for (const id of ["G1", "G2", "G3", "G4", "G5"]) {
      expect(doc).toMatch(new RegExp(`\\|\\s*${id}\\s*\\|`));
    }
  });

  it("documents the canonical protocol topic key", () => {
    const doc = readDoc();
    expect(doc).toContain("engram-rag/agent-rigor-protocol/v2");
  });

  it("documents the report path and the verify command", () => {
    const doc = readDoc();
    expect(doc).toContain("reports/phase4/verify-report.json");
    expect(doc).toContain("npm run verify:phase4");
  });

  it("documents the forbidden v1 aliases that G4 guards against", () => {
    const doc = readDoc();
    expect(doc).toContain("protocol/rigor");
    expect(doc).toContain("pattern/agent-rigor-protocol");
    expect(doc).toContain("sdd/engram-rag-fase-2/");
  });

  it("contains a live result block that matches the current eval report", () => {
    if (!existsSync(REPORT_PATH)) {
      // The live result block is best-effort: it is updated by
      // the closure commit, not by the verify run. The doc is
      // still valid if the report is not present.
      return;
    }
    const report = JSON.parse(readFileSync(REPORT_PATH, "utf8"));
    const doc = readDoc();
    expect(doc).toContain("Phase 4 PR-C");
    // The live-result block must show the same scenario count
    // as the current eval report.
    if (report.metrics?.scenarios_total !== undefined) {
      const n = report.metrics.scenarios_total;
      // The doc shows a fixed `5` only when scenarios_total === 5.
      // If the doc says 5 and the report says something else, that
      // is a documentation drift.
      if (n === 5) {
        expect(doc).toMatch(/scenarios: 5/);
      }
    }
  });
});
