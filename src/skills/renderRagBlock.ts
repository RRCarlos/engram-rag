import { CANONICAL_PROTOCOL_TOPIC_KEY } from "../contracts/topicKeys.js";
import type { AgentId } from "./types.js";

/**
 * Render the Engram RAG preflight block for a given agent.
 *
 * The block is a self-contained markdown snippet that is meant to be
 * inserted (or replaced) inside a SKILL.md file, after the YAML
 * frontmatter. It is delimited by HTML comments that the patcher
 * (see `patchSkill.ts`) uses to find and replace the block without
 * touching the rest of the file.
 *
 * Contract:
 *   - The output ALWAYS contains a `<!-- ENGRAM_RAG_BLOCK_START ... -->`
 *     and a `<!-- ENGRAM_RAG_BLOCK_END -->` pair.
 *   - The `agent=...` and `topic=...` tags in the START comment are
 *     the structural anchor used by `verifySkill` to confirm the
 *     block is well-formed and points to the right agent/topic.
 *   - The canonical topic key appears literally in the rendered body
 *     (not just the comment) so a human reader of the skill file
 *     can see it. The body also names the forbidden v1 aliases
 *     defensively, but the verifier is the real enforcer.
 *   - Output is deterministic: same agent_id in, same string out.
 *     No timestamps, no random IDs.
 */
export function renderRagBlock(agentId: AgentId): string {
  // The body uses a blockquote so it renders with visible emphasis
  // in markdown previewers, and a fenced code line for the command
  // (so the `engram-rag preflight` invocation is copy-pasteable).
  //
  // The forbidden v1 topic aliases are intentionally NOT listed by
  // name in the body: the literal strings are owned by the policy
  // module (`src/contracts/topicKeys.ts`) and the verifier is the
  // single source of truth for what is and is not allowed. Mentioning
  // the aliases here would force this file onto the
  // `noLegacyTopicKeys` guardrail's exception list and create a
  // second place to keep in sync.
  const body = [
    "",
    "> **Engram RAG preflight (auto-generated)** — before any action on this",
    "> skill, run:",
    ">",
    `> \`engram-rag preflight --project engram-rag --agent ${agentId} --task-file <task> --json\``,
    ">",
    `> Canonical topic: \`${CANONICAL_PROTOCOL_TOPIC_KEY}\`. Any other`,
    "> topic key (including v1 aliases) is forbidden by policy.",
    "",
  ].join("\n");

  return [
    `<!-- ENGRAM_RAG_BLOCK_START agent=${agentId} topic=${CANONICAL_PROTOCOL_TOPIC_KEY} -->`,
    body,
    "<!-- ENGRAM_RAG_BLOCK_END -->",
    "",
  ].join("\n");
}
