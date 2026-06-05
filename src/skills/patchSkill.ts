import { renderRagBlock } from "./renderRagBlock.js";
import type { AgentId, PatchResult } from "./types.js";

/**
 * Patch a SKILL.md's content to embed (or update) the Engram RAG block.
 *
 * Behaviour:
 *   1. The file MUST start with a YAML frontmatter delimited by `---`.
 *      If it does not, the function returns the input unchanged with
 *      `changed: false` and a human-readable `reason`. This is a soft
 *      error: the caller decides whether to surface it.
 *   2. If a RAG block (delimited by the START/END HTML comments) is
 *      already present anywhere in the file, it is REPLACED in place.
 *      The replacement is byte-identical to a freshly rendered block
 *      for the same `agentId`, so running `patchSkill` twice is
 *      idempotent (second run returns `changed: false`).
 *   3. If no RAG block is present, a fresh one is INSERTED immediately
 *      after the closing `---` of the frontmatter, preceded by a
 *      blank line so the block reads as its own section.
 *
 * The function is pure: it does not touch the filesystem. The caller
 * (the `installSkills` CLI) is responsible for backups and writes.
 */
export function patchSkill(content: string, agentId: AgentId): PatchResult {
  // Normalize CRLF to LF for all internal logic. The renderRagBlock
  // output uses LF, and on a Windows checkout with
  // `core.autocrlf=true` the input file may arrive with CRLF. Without
  // normalization the byte-for-byte idempotency check (`replaced ===
  // content`) would always fail for CRLF inputs even when the block
  // is textually correct. The output is always LF: markdown files
  // are line-ending-agnostic and the verifier does not care.
  const normalized = content.replace(/\r\n/g, "\n");
  // 1. Frontmatter must be at the very start of the file, otherwise
  //    we refuse to touch the file. Patching mid-file is too risky
  //    for non-standard frontmatter layouts.
  const fmMatch = normalized.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  if (fmMatch === null) {
    return {
      // Return the ORIGINAL content, not the normalized one. The
      // contract for a refused file is "byte-for-byte identical to
      // the input"; normalizing would silently mutate CRLF files.
      content,
      changed: false,
      reason: "no frontmatter: file does not start with ---",
    };
  }
  const fmEnd = fmMatch[0].length; // index just past the frontmatter

  const fresh = renderRagBlock(agentId);

  // 2. Look for an existing RAG block ANYWHERE in the file. We do not
  //    constrain the search to "after the frontmatter" because some
  //    skills may have been hand-edited in odd ways and we still want
  //    to converge them.
  const blockRe =
    /<!-- ENGRAM_RAG_BLOCK_START[^>]*-->\r?\n[\s\S]*?<!-- ENGRAM_RAG_BLOCK_END -->\r?\n?/;

  const existingMatch = normalized.match(blockRe);
  if (existingMatch !== null) {
    const start = existingMatch.index ?? 0;
    const end = start + existingMatch[0].length;
    const replaced =
      normalized.slice(0, start) + fresh + normalized.slice(end);
    // Determinism check: replacing an existing block with a freshly
    // rendered block for the SAME agent must yield the same content.
    // If it does not, renderRagBlock has a hidden state, which is a
    // bug we want to surface loudly.
    const idempotent = renderRagBlock(agentId);
    if (replaced === normalized) {
      return { content: normalized, changed: false, reason: "block already up to date" };
    }
    if (replaced !== normalized.slice(0, start) + idempotent + normalized.slice(end)) {
      return {
        content: normalized,
        changed: false,
        reason: "internal: renderRagBlock is not deterministic",
      };
    }
    return { content: replaced, changed: true, reason: "replaced existing block" };
  }

  // 3. No existing block: insert right after the frontmatter, with a
  //    blank line so the block reads as its own section.
  const before = normalized.slice(0, fmEnd);
  const after = normalized.slice(fmEnd);
  // Avoid a leading blank line if the file already starts the body
  // with a blank line (common style: `---` then blank then `## ...`).
  const separator = after.startsWith("\n") ? "" : "\n";
  const inserted = before + separator + fresh + after;
  return { content: inserted, changed: true, reason: "inserted new block after frontmatter" };
}
