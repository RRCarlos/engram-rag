import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const DOC = resolve(process.cwd(), "docs/phase3-acceptance.md");

function readDoc(): string {
  return readFileSync(DOC, "utf8");
}

describe("Phase 3 acceptance document", () => {
  it("requires the four CI closure commands, in order", () => {
    const doc = readDoc();
    // Order matters: the verify steps are listed as the
    // non-regression checks for the previous phases, then the
    // Phase 3 closure step. Asserting order keeps the doc honest.
    const testIdx = doc.indexOf("npm test");
    const phase1Idx = doc.indexOf("npm run verify:phase1");
    const phase2Idx = doc.indexOf("npm run verify:phase2");
    const phase3Idx = doc.indexOf("npm run verify:phase3");
    expect(testIdx).toBeGreaterThan(-1);
    expect(phase1Idx).toBeGreaterThan(testIdx);
    expect(phase2Idx).toBeGreaterThan(phase1Idx);
    expect(phase3Idx).toBeGreaterThan(phase2Idx);
  });

  it("names the Phase 3 verify report and required metrics", () => {
    const doc = readDoc();
    expect(doc).toContain("reports/phase3/verify-report.json");
    expect(doc).toContain("metrics.dry_run_idempotent: true");
    expect(doc).toContain("fixtures_actual_pass == metrics.fixtures_expected_pass");
  });

  it("documents the five acceptance gates from design §5", () => {
    const doc = readDoc();
    // G1: a real SKILL.md carries the block.
    // G2: unit tests for the skill layer.
    // G3: dry-run is byte-idempotent.
    // G4: verify:phase3 exits 0 with the report.
    // G5: CI runs the verify:phase3 step.
    expect(doc).toMatch(/G1[\s\S]*SKILL\.md/);
    expect(doc).toMatch(/G2[\s\S]*unit tests/);
    expect(doc).toMatch(/G3[\s\S]*dry-run/);
    expect(doc).toMatch(/G4[\s\S]*exits 0/);
    expect(doc).toMatch(/G5[\s\S]*CI/);
  });

  it("names every Phase 3 source artifact", () => {
    const doc = readDoc();
    expect(doc).toContain("src/skills/renderRagBlock.ts");
    expect(doc).toContain("src/skills/patchSkill.ts");
    expect(doc).toContain("src/skills/verifySkill.ts");
    expect(doc).toContain("src/cli/installSkills.ts");
    expect(doc).toContain("src/cli/verifyPhase3.ts");
  });

  it("documents why verify integration tests are excluded from npm test", () => {
    const doc = readDoc();
    expect(doc).toContain("nested Vitest runs");
    expect(doc).toContain("intentionally not part of `npm test`");
  });

  it("rejects live MCP in CI", () => {
    const doc = readDoc();
    expect(doc).toContain("Live MCP is kept out of CI");
    expect(doc).toContain("noLiveMcpInTests");
  });
});
