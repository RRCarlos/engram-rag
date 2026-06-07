import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "..", "..");

function readWorkflow(): string {
  return readFileSync(
    resolve(REPO_ROOT, ".github/workflows/ci.yml"),
    "utf8",
  );
}

describe("ci workflow", () => {
  it("declares Node 24", () => {
    const wf = readWorkflow();
    expect(wf).toMatch(/node-version:\s*["']?24["']?/);
  });

  it("runs npm ci to install dependencies", () => {
    const wf = readWorkflow();
    expect(wf).toMatch(/run:\s*npm ci/);
  });

  it("runs npm test", () => {
    const wf = readWorkflow();
    expect(wf).toMatch(/run:\s*npm test/);
  });

  it("runs Phase 1, Phase 2, Phase 3, and Phase 4 verify scripts after the test suite, in order", () => {
    const wf = readWorkflow();
    const testIndex = wf.indexOf("run: npm test");
    const phase1Index = wf.indexOf("run: npm run verify:phase1");
    const phase2Index = wf.indexOf("run: npm run verify:phase2");
    const phase3Index = wf.indexOf("run: npm run verify:phase3");
    const phase4Index = wf.indexOf("run: npm run verify:phase4");

    expect(phase1Index).toBeGreaterThan(testIndex);
    expect(phase2Index).toBeGreaterThan(phase1Index);
    expect(phase3Index).toBeGreaterThan(phase2Index);
    expect(phase4Index).toBeGreaterThan(phase3Index);
  });

  it("runs the PR5 / #31 unified verify:all gate after the test suite", () => {
    // PR5 / #31 closes the spec scenario "Stable verify commands":
    // the new entry point is non-recursive, replaces the old
    // `test:verify` script, and is wired into CI so a regression in
    // the operational loop cannot merge.
    const wf = readWorkflow();
    expect(wf).toMatch(/run:\s*npm run verify:all/);
    // The verify:all step must come AFTER `npm test` so a test
    // regression is caught first.
    const testIndex = wf.indexOf("run: npm test");
    const verifyAllIndex = wf.indexOf("run: npm run verify:all");
    expect(verifyAllIndex).toBeGreaterThan(testIndex);
  });

  it("runs the PR5 / #31 MCP smoke step in CI", () => {
    // The MCP smoke is a fast static check (no server spawn) and
    // guards the no-rag_* surface, the launcher shape, and the
    // 7-tool union.
    const wf = readWorkflow();
    expect(wf).toMatch(/run:\s*npm run mcp:smoke/);
  });

  it("triggers on push and pull_request to main", () => {
    const wf = readWorkflow();
    expect(wf).toMatch(/push:/);
    expect(wf).toMatch(/pull_request:/);
    expect(wf).toMatch(/branches:\s*\[main\]/);
  });
});
