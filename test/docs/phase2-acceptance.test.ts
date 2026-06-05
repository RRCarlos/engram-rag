import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const DOC = resolve(process.cwd(), "docs/phase2-acceptance.md");

function readDoc(): string {
  return readFileSync(DOC, "utf8");
}

describe("Phase 2 acceptance document", () => {
  it("requires the three CI closure commands", () => {
    const doc = readDoc();
    expect(doc).toContain("npm test");
    expect(doc).toContain("npm run verify:phase1");
    expect(doc).toContain("npm run verify:phase2");
  });

  it("names the Phase 2 verify report and required metrics", () => {
    const doc = readDoc();
    expect(doc).toContain("reports/phase2/verify-report.json");
    expect(doc).toContain("metrics.latency_ms_p95 <= 2000");
    expect(doc).toContain("metrics.degraded_supported: true");
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
