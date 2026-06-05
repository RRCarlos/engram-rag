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
  it("declares Node 20", () => {
    const wf = readWorkflow();
    expect(wf).toMatch(/node-version:\s*["']?20["']?/);
  });

  it("runs npm ci to install dependencies", () => {
    const wf = readWorkflow();
    expect(wf).toMatch(/run:\s*npm ci/);
  });

  it("runs npm test", () => {
    const wf = readWorkflow();
    expect(wf).toMatch(/run:\s*npm test/);
  });

  it("runs Phase 1 and Phase 2 verify scripts after the test suite", () => {
    const wf = readWorkflow();
    const testIndex = wf.indexOf("run: npm test");
    const phase1Index = wf.indexOf("run: npm run verify:phase1");
    const phase2Index = wf.indexOf("run: npm run verify:phase2");

    expect(phase1Index).toBeGreaterThan(testIndex);
    expect(phase2Index).toBeGreaterThan(phase1Index);
  });

  it("triggers on push and pull_request to main", () => {
    const wf = readWorkflow();
    expect(wf).toMatch(/push:/);
    expect(wf).toMatch(/pull_request:/);
    expect(wf).toMatch(/branches:\s*\[main\]/);
  });
});
