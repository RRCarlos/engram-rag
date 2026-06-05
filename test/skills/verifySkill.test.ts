import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { verifySkill } from "../../src/skills/verifySkill.js";
import { renderRagBlock } from "../../src/skills/renderRagBlock.js";
import { patchSkill } from "../../src/skills/patchSkill.js";

const FIXTURES = resolve(__dirname, "..", "fixtures", "skills");

function readFixture(name: string): string {
  return readFileSync(resolve(FIXTURES, name), "utf8");
}

describe("verifySkill", () => {
  it("accepts a freshly patched skill for the right agent", () => {
    const clean = readFixture("sdd-apply-clean.md");
    const patched = patchSkill(clean, "sdd-apply");
    const result = verifySkill(patched.content, "sdd-apply");
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("accepts the hand-written patched fixture as-is", () => {
    const patched = readFixture("sdd-apply-patched.md");
    const result = verifySkill(patched, "sdd-apply");
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects a clean skill that has no RAG block", () => {
    const clean = readFixture("sdd-apply-clean.md");
    const result = verifySkill(clean, "sdd-apply");
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("no RAG block"))).toBe(true);
  });

  it("rejects a file without frontmatter", () => {
    const bad = readFixture("no-frontmatter.md");
    const result = verifySkill(bad, "sdd-apply");
    expect(result.ok).toBe(false);
    expect(
      result.errors.some(
        (e) => e.includes("frontmatter") || e.includes("---"),
      ),
    ).toBe(true);
  });

  it("rejects a block whose topic tag is a v1 alias", () => {
    const bad = readFixture("wrong-topic.md");
    const result = verifySkill(bad, "sdd-apply");
    expect(result.ok).toBe(false);
    expect(
      result.errors.some(
        (e) => e.includes("topic tag") && e.includes("protocol/rigor/v1"),
      ),
    ).toBe(true);
  });

  it("rejects a block whose agent tag does not match the expected agent", () => {
    const patched = readFixture("sdd-apply-patched.md");
    // The fixture carries agent=sdd-apply, so verifying as sdd-verify
    // must surface a mismatch.
    const result = verifySkill(patched, "sdd-verify");
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("agent tag"))).toBe(true);
  });

  it("flags v1 forbidden aliases appearing OUTSIDE the RAG block as warnings, not errors", () => {
    // Start from a properly patched file, then add the alias in the
    // user-written body (outside the block). The verifier must still
    // pass overall and surface the alias as a warning.
    const clean = readFixture("sdd-apply-clean.md");
    const patched = patchSkill(clean, "sdd-apply");
    // Append the alias to the end of the user body. The block ends
    // with `<!-- ENGRAM_RAG_BLOCK_END -->\n` so we add content after
    // a blank line, well clear of the block.
    const content = `${patched.content}\nSee also: protocol/rigor\n`;
    // Sanity: the block is the rendered one, the alias is outside.
    expect(content).toContain(renderRagBlock("sdd-apply"));
    expect(content).toContain("protocol/rigor");
    const result = verifySkill(content, "sdd-apply");
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.includes("protocol/rigor"))).toBe(true);
  });

  it("rejects a v1 forbidden alias appearing INSIDE the RAG block", () => {
    // Start from a properly patched file and inject the forbidden
    // alias into the block body (after the START comment, before the
    // END comment). The verifier must fail with a specific error.
    const clean = readFixture("sdd-apply-clean.md");
    const patched = patchSkill(clean, "sdd-apply");
    const tampered = patched.content.replace(
      /ENGRAM_RAG_BLOCK_START[^>]*-->/,
      "ENGRAM_RAG_BLOCK_START agent=sdd-apply topic=engram-rag/agent-rigor-protocol/v2 -->\n> legacy: protocol/rigor\n",
    );
    // Sanity: the tampered file still has a START comment and the
    // alias is in the body.
    expect(tampered).toContain("ENGRAM_RAG_BLOCK_START");
    expect(tampered).toContain("> legacy: protocol/rigor");
    const result = verifySkill(tampered, "sdd-apply");
    expect(result.ok).toBe(false);
    expect(
      result.errors.some(
        (e) => e.includes("forbidden v1 topic alias") && e.includes("protocol/rigor"),
      ),
    ).toBe(true);
  });

  it("rejects a block with a missing agent tag", () => {
    const block = [
      "<!-- ENGRAM_RAG_BLOCK_START topic=engram-rag/agent-rigor-protocol/v2 -->",
      "",
      "> body",
      "",
      "<!-- ENGRAM_RAG_BLOCK_END -->",
    ].join("\n");
    const content = `---\nname: test\n---\n${block}\n`;
    const result = verifySkill(content, "sdd-apply");
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("agent="))).toBe(true);
  });
});
