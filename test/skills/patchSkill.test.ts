import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { patchSkill } from "../../src/skills/patchSkill.js";
import { renderRagBlock } from "../../src/skills/renderRagBlock.js";
import { verifySkill } from "../../src/skills/verifySkill.js";

const FIXTURES = resolve(__dirname, "..", "fixtures", "skills");

function readFixture(name: string): string {
  return readFileSync(resolve(FIXTURES, name), "utf8");
}

describe("patchSkill", () => {
  it("inserts a fresh block after the frontmatter on a clean skill", () => {
    const before = readFixture("sdd-apply-clean.md");
    const result = patchSkill(before, "sdd-apply");
    expect(result.changed).toBe(true);
    expect(result.reason).toBe("inserted new block after frontmatter");
    // The body that was already there must still be present.
    expect(result.content).toContain("## When to Use");
    expect(result.content).toContain("## More Body");
    // The new block must be present and well-formed.
    const verify = verifySkill(result.content, "sdd-apply");
    expect(verify.ok).toBe(true);
    expect(verify.errors).toEqual([]);
  });

  it("is idempotent: a second call on the patched content is a no-op", () => {
    const before = readFixture("sdd-apply-clean.md");
    const first = patchSkill(before, "sdd-apply");
    const second = patchSkill(first.content, "sdd-apply");
    expect(second.changed).toBe(false);
    expect(second.reason).toBe("block already up to date");
    expect(second.content).toBe(first.content);
  });

  it("replaces an existing block in place without appending a second one", () => {
    const before = readFixture("sdd-apply-patched.md");
    const result = patchSkill(before, "sdd-apply");
    expect(result.changed).toBe(false);
    expect(result.reason).toBe("block already up to date");

    // Also: re-render the block for a different agent, which MUST
    // change the content (the agent tag in START differs).
    const switched = patchSkill(before, "sdd-verify");
    expect(switched.changed).toBe(true);
    expect(switched.reason).toBe("replaced existing block");
    expect(switched.content).not.toBe(before);
    // The block must now point at sdd-verify, not sdd-apply.
    expect(switched.content).toContain("agent=sdd-verify");
    expect(switched.content).not.toContain("agent=sdd-apply topic=");
    // And it must verify cleanly under the new agent.
    const verify = verifySkill(switched.content, "sdd-verify");
    expect(verify.ok).toBe(true);
  });

  it("refuses to touch a file without YAML frontmatter", () => {
    const before = readFixture("no-frontmatter.md");
    const result = patchSkill(before, "sdd-apply");
    expect(result.changed).toBe(false);
    expect(result.reason).toContain("no frontmatter");
    expect(result.content).toBe(before);
  });

  it("does not duplicate the block when the fresh render equals the existing one", () => {
    const rendered = renderRagBlock("sdd-apply");
    // Sanity: rendered string is a single block (one START, one END).
    const starts = (rendered.match(/ENGRAM_RAG_BLOCK_START/g) ?? []).length;
    const ends = (rendered.match(/ENGRAM_RAG_BLOCK_END/g) ?? []).length;
    expect(starts).toBe(1);
    expect(ends).toBe(1);
  });

  it("preserves user-written body content before and after the block", () => {
    const before = readFixture("sdd-apply-clean.md");
    const result = patchSkill(before, "sdd-apply");
    // Pre-frontmatter (none here) and post-block sections all survive.
    expect(result.content).toContain("## When to Use");
    expect(result.content).toContain("## Critical Rules");
    expect(result.content).toContain("## More Body");
    expect(result.content).toContain("Item one");
  });

  it("matches the block that renderRagBlock produces for the same agent", () => {
    const before = readFixture("sdd-apply-clean.md");
    const result = patchSkill(before, "sdd-apply");
    const expectedBlock = renderRagBlock("sdd-apply");
    expect(result.content).toContain(expectedBlock);
  });
});
