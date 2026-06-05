import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderRagBlock } from "../../src/skills/renderRagBlock.js";
import {
  AgentIdSchema,
  PatchResultSchema,
  SkillVerificationSchema,
} from "../../src/skills/types.js";
import { CANONICAL_PROTOCOL_TOPIC_KEY } from "../../src/contracts/topicKeys.js";

const FIXTURES = resolve(__dirname, "..", "fixtures", "skills");

function readFixture(name: string): string {
  return readFileSync(resolve(FIXTURES, name), "utf8");
}

describe("renderRagBlock", () => {
  it("starts with the ENGRAM_RAG_BLOCK_START comment for the given agent", () => {
    const out = renderRagBlock("sdd-apply");
    expect(out.startsWith("<!-- ENGRAM_RAG_BLOCK_START ")).toBe(true);
    expect(out).toContain(`agent=sdd-apply`);
  });

  it("embeds the canonical protocol topic key in the START tag", () => {
    const out = renderRagBlock("sdd-verify");
    expect(out).toContain(`topic=${CANONICAL_PROTOCOL_TOPIC_KEY}`);
  });

  it("shows the canonical topic literally in the body, not only the comment", () => {
    const out = renderRagBlock("sdd-apply");
    // Count occurrences: at least 2 (one in the START comment, one in the body).
    const matches = out.match(new RegExp(CANONICAL_PROTOCOL_TOPIC_KEY, "g"));
    expect(matches !== null && matches.length >= 2).toBe(true);
  });

  it("closes with the ENGRAM_RAG_BLOCK_END comment", () => {
    const out = renderRagBlock("sdd-apply");
    expect(out.trimEnd().endsWith("<!-- ENGRAM_RAG_BLOCK_END -->")).toBe(true);
  });

  it("includes a copy-pasteable preflight command line for the agent", () => {
    const out = renderRagBlock("sdd-apply");
    expect(out).toContain(
      "engram-rag preflight --project engram-rag --agent sdd-apply --task-file <task> --json",
    );
  });

  it("mentions the policy in the body without listing forbidden alias literals", () => {
    // The literal forbidden alias strings live in
    // `src/contracts/topicKeys.ts` and are enforced by the verifier.
    // The body of the block points readers at the canonical topic
    // and the policy without echoing the alias list — that keeps
    // this file off the `noLegacyTopicKeys` guardrail exception
    // list and prevents drift between this body and the policy.
    const out = renderRagBlock("sdd-apply");
    expect(out).toContain("forbidden by policy");
    expect(out).not.toContain("protocol/rigor");
    expect(out).not.toContain("pattern/agent-rigor-protocol");
  });

  it("is deterministic: two calls produce the same string", () => {
    const a = renderRagBlock("sdd-design");
    const b = renderRagBlock("sdd-design");
    expect(a).toBe(b);
  });

  it("differs by agent_id", () => {
    expect(renderRagBlock("sdd-apply")).not.toBe(renderRagBlock("sdd-verify"));
  });

  it("is well-formed against the shared Zod contract", () => {
    // PatchResultSchema and SkillVerificationSchema cover the CLI
    // surface. The renderer itself returns a plain string, but the
    // string MUST be parseable as a block by patchSkill/verifySkill
    // (covered by the patcher/verifier tests). This test pins the
    // Zod schemas in place so a future refactor of types.ts cannot
    // silently widen them.
    for (const id of [
      "sdd-apply",
      "sdd-spec",
      "sdd-design",
      "sdd-verify",
      "sdd-explore",
      "sdd-tasks",
      "sdd-propose",
      "sdd-archive",
      "sdd-init",
      "sdd-onboard",
    ] as const) {
      expect(AgentIdSchema.parse(id)).toBe(id);
    }
    // And a non-member agent id must be rejected.
    expect(() => AgentIdSchema.parse("not-an-agent")).toThrow();
    // And the result schemas must round-trip a canonical valid input.
    expect(
      PatchResultSchema.parse({ content: "x", changed: true, reason: "y" }),
    ).toEqual({ content: "x", changed: true, reason: "y" });
    expect(
      SkillVerificationSchema.parse({ ok: true, errors: [], warnings: [] }),
    ).toEqual({ ok: true, errors: [], warnings: [] });
  });

  it("rejects an obviously malformed PatchResult at the Zod boundary", () => {
    expect(() => PatchResultSchema.parse({ content: 42, changed: true })).toThrow();
    expect(() => SkillVerificationSchema.parse({ ok: "yes", errors: [] })).toThrow();
  });
});

describe("fixtures are present and parseable", () => {
  it("sdd-apply-clean.md exists and has frontmatter", () => {
    const content = readFixture("sdd-apply-clean.md");
    // Be line-ending agnostic: on Windows with `core.autocrlf=true`
    // the fixture is checked out as CRLF, so the boundary after the
    // opening `---` may be `\r\n` or `\n` depending on platform.
    expect(content.startsWith("---")).toBe(true);
  });

  it("sdd-apply-patched.md exists and contains a RAG block for sdd-apply", () => {
    const content = readFixture("sdd-apply-patched.md");
    expect(content).toContain("ENGRAM_RAG_BLOCK_START agent=sdd-apply");
    expect(content).toContain("ENGRAM_RAG_BLOCK_END");
  });

  it("no-frontmatter.md exists and intentionally lacks frontmatter", () => {
    const content = readFixture("no-frontmatter.md");
    expect(content.startsWith("# ")).toBe(true);
  });

  it("wrong-topic.md exists and carries a forbidden v1 topic in its block", () => {
    const content = readFixture("wrong-topic.md");
    expect(content).toContain("topic=protocol/rigor/v1");
  });
});
