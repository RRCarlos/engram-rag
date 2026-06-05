import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "..", "..");

function readDoc(): string {
  return readFileSync(resolve(REPO_ROOT, "docs/evidence/v1-forensics.md"), "utf8");
}

describe("v1-forensics", () => {
  it("cites Engram observation #728 by id", () => {
    const doc = readDoc();
    expect(doc).toMatch(/#728/);
  });

  it("names the canonical repo-state topic key for that observation", () => {
    const doc = readDoc();
    expect(doc).toContain("engram-rag/repo-state-2026-06-05");
  });

  it("references the v1 cierre path with line ranges", () => {
    const doc = readDoc();
    expect(doc).toContain("rag-system/fase-final/CIERRE-FASES.md:3-7");
    expect(doc).toContain("rag-system/fase-final/CIERRE-FASES.md:69-87");
  });

  it("references the v1 dashboard hardcoded data path", () => {
    const doc = readDoc();
    expect(doc).toContain("rag-system/dashboard/app.js:4-30");
  });

  it("flags the document as historical evidence only", () => {
    const doc = readDoc();
    expect(doc.toLowerCase()).toContain("historical evidence");
  });

  it("lists the canonical v2 protocol topic key for the replacement", () => {
    const doc = readDoc();
    expect(doc).toContain("engram-rag/agent-rigor-protocol/v2");
  });
});
