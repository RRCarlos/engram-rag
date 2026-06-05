import { CANONICAL_PROTOCOL_TOPIC_KEY } from "../contracts/topicKeys.js";
import { FORBIDDEN_TOPIC_ALIASES } from "../contracts/topicKeys.js";
import type { AgentId, SkillVerification } from "./types.js";

/**
 * Verify that a SKILL.md's content carries a well-formed Engram RAG
 * block for the given agent.
 *
 * The verifier is intentionally read-only and pure: it does not modify
 * the input, and it never throws on bad content. Failures are reported
 * via `errors`; soft concerns (e.g. "block is present but uses a
 * legacy topic alias") are reported via `warnings`.
 *
 * Checks performed (in order, all errors short-circuit `ok` to false):
 *   1. The file starts with a YAML frontmatter `---` block.
 *   2. A RAG block delimited by the START/END HTML comments exists
 *      somewhere in the file.
 *   3. The START comment's `agent=...` tag matches `agentId`.
 *   4. The START comment's `topic=...` tag equals the canonical
 *      protocol topic key.
 *   5. The block body does not contain any v1 forbidden topic alias.
 *      (Warns rather than fails when the alias appears OUTSIDE the
 *      block, because the patcher is not the only writer and the
 *      `noLegacyTopicKeys` guardrail already covers the rest of the
 *      repo.)
 */
export function verifySkill(
  content: string,
  agentId: AgentId,
): SkillVerification {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Frontmatter.
  if (!content.startsWith("---\n") && !content.startsWith("---\r\n")) {
    errors.push("file does not start with a YAML frontmatter delimiter (---)");
    return { ok: false, errors, warnings };
  }
  const fmEnd = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  if (fmEnd === null) {
    errors.push("frontmatter is not properly closed with a second --- line");
    return { ok: false, errors, warnings };
  }

  // 2. RAG block presence.
  const blockMatch = content.match(
    /<!-- ENGRAM_RAG_BLOCK_START[^>]*-->\r?\n[\s\S]*?<!-- ENGRAM_RAG_BLOCK_END -->/,
  );
  if (blockMatch === null) {
    errors.push(
      "no RAG block found (missing ENGRAM_RAG_BLOCK_START / END pair)",
    );
    return { ok: false, errors, warnings };
  }
  const block = blockMatch[0];
  const startTag = block.match(/<!-- ENGRAM_RAG_BLOCK_START([^>]*)-->/);
  if (startTag === null) {
    errors.push("RAG block START comment is malformed");
    return { ok: false, errors, warnings };
  }
  const attrs = startTag[1];

  // 3. agent=... tag.
  const agentMatch = attrs.match(/agent=([^\s]+)/);
  if (agentMatch === null) {
    errors.push("RAG block START comment is missing the `agent=` tag");
  } else if (agentMatch[1] !== agentId) {
    errors.push(
      `RAG block agent tag is "${agentMatch[1]}" but expected "${agentId}"`,
    );
  }

  // 4. topic=... tag.
  const topicMatch = attrs.match(/topic=([^\s]+)/);
  if (topicMatch === null) {
    errors.push("RAG block START comment is missing the `topic=` tag");
  } else if (topicMatch[1] !== CANONICAL_PROTOCOL_TOPIC_KEY) {
    errors.push(
      `RAG block topic tag is "${topicMatch[1]}" but expected the canonical "${CANONICAL_PROTOCOL_TOPIC_KEY}"`,
    );
  }

  // 5. Forbidden v1 aliases inside the block body. We strip the
  //    comment lines first so a future comment that mentions a
  //    forbidden alias for documentation purposes does not fail the
  //    verify — only the body that the agent actually reads counts.
  const blockBody = block
    .replace(/<!-- ENGRAM_RAG_BLOCK_START[^>]*-->/, "")
    .replace(/<!-- ENGRAM_RAG_BLOCK_END -->/, "");
  for (const alias of FORBIDDEN_TOPIC_ALIASES) {
    if (blockBody.includes(alias)) {
      errors.push(
        `RAG block body contains forbidden v1 topic alias "${alias}"`,
      );
    }
  }

  // Warnings: forbidden alias OUTSIDE the block (i.e. in user content).
  const outsideBlock = content.replace(block, "");
  for (const alias of FORBIDDEN_TOPIC_ALIASES) {
    if (outsideBlock.includes(alias)) {
      warnings.push(
        `v1 topic alias "${alias}" appears outside the RAG block (in user-written content)`,
      );
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}
