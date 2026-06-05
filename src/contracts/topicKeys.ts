/**
 * Canonical topic key policy for the engram-rag/agent-rigor-protocol v2.
 *
 * This module is the single source of truth for the protocol's topic key
 * and the historical aliases that must NEVER appear in active code,
 * fixtures, or skill blocks. The forensic evidence file
 * `docs/evidence/v1-forensics.md` is the only place those aliases are
 * allowed to appear, and the guardrail test
 * `test/guardrails/noLegacyTopicKeys.test.ts` enforces that.
 */

export const CANONICAL_PROTOCOL_TOPIC_KEY = "engram-rag/agent-rigor-protocol/v2";

/**
 * Historical v1 aliases that are forbidden in active artifacts.
 * Order is not significant. Each entry is a literal substring (not a
 * regex) that must be detected by the guardrail test.
 */
export const FORBIDDEN_TOPIC_ALIASES: readonly string[] = [
  "protocol/rigor",
  "protocol/rigor/v1",
  "pattern/agent-rigor-protocol",
  "pattern/agent-rigor-protocol-v1-master",
  "sdd/engram-rag-fase-2/",
] as const;

/**
 * Return the canonical protocol topic key.
 *
 * Exists as a function (not just a constant export) so callers and tests
 * can depend on a stable symbol and not on importing a literal.
 */
export function getCanonicalProtocolTopicKey(): string {
  return CANONICAL_PROTOCOL_TOPIC_KEY;
}

/**
 * Build a derived failure key for a specific agent and failure slug.
 * The returned key always references the canonical protocol key so a
 * downstream consumer can resolve the protocol from any record.
 */
export function buildFailureTopicKey(
  agentId: string,
  failureSlug: string,
): string {
  if (!agentId) {
    throw new Error("agentId is required");
  }
  if (!failureSlug) {
    throw new Error("failureSlug is required");
  }
  return `engram-rag/failures/${agentId}/${failureSlug}`;
}

/**
 * Throw if the input string contains any forbidden v1 topic alias.
 * Use this on raw user input, file contents, and skill blocks before
 * they are committed to Engram or rendered into a skill.
 */
export function assertNoForbiddenTopicAliases(input: string): void {
  if (typeof input !== "string") {
    throw new TypeError("assertNoForbiddenTopicAliases requires a string");
  }
  for (const alias of FORBIDDEN_TOPIC_ALIASES) {
    if (input.includes(alias)) {
      throw new Error(
        `Forbidden v1 topic alias detected: "${alias}". ` +
          `Use "${CANONICAL_PROTOCOL_TOPIC_KEY}" instead.`,
      );
    }
  }
}
