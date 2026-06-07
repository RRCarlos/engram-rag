import { createHash } from "node:crypto";
import type { KnowledgeRecord } from "../contracts/knowledgeRecord.js";
import { CANONICAL_PROTOCOL_TOPIC_KEY } from "../contracts/topicKeys.js";
import type { RetrievalRequest } from "../contracts/retrieval.js";

/**
 * Stable operational trace IDs for the agent-error-learning loop.
 *
 * The enforcement trace ID computed in `src/engram/enforcement.ts` is
 * bound to the exact consult state (consulted observation ids, missing
 * records, and degraded flag). That trace is great for debugging a
 * single decision but it shifts whenever the live Engram state shifts
 * (a new observation, a quarantined record, a degraded retrieval).
 *
 * The **stable** trace ID in this module is bound to the LOGICAL
 * operation the agent is about to perform:
 *
 *   - `project`           — the engram-rag project name.
 *   - `agent_id`          — the sdd-* agent identifier.
 *   - `task_norm`         — the task text with whitespace collapsed
 *                           and case folded (the agent's intent,
 *                           not its surface form).
 *   - `action_kind`       — read | write | shell | spec | design |
 *                           verify | review.
 *   - `shell`             — the shell kind for shell actions
 *                           (empty for non-shell actions).
 *   - `protocol_key`      — the canonical protocol topic key
 *                           (versioned so protocol changes break the
 *                           trace).
 *   - `consulted_signature_set`
 *                         — the SORTED, DEDUPED set of
 *                           `failure_signature` values across the
 *                           consulted records. This is the part that
 *                           decouples the trace from raw observation
 *                           ids.
 *
 * The stable trace is INDEPENDENT of:
 *
 *   - The exact observation ids consulted (a live state shift that
 *     keeps the same signatures produces the same stable trace).
 *   - Whether the retrieval is degraded (a degraded run on the same
 *     input + signatures produces the same stable trace).
 *   - The latency of the consult.
 *
 * It CHANGES when:
 *
 *   - The agent (or its task text, or its action / shell) changes.
 *   - The protocol version changes.
 *   - The consulted set of `failure_signature` values changes (e.g.
 *     a new failure record becomes part of the consulted set).
 *
 * This satisfies the PR4 hard product rule: trace IDs stay stable
 * across live state shifts when the input + action + consulted
 * signature set is identical.
 */

export interface StableTraceInput {
  request: RetrievalRequest;
  records: readonly KnowledgeRecord[];
}

/**
 * Normalize a task text for stable hashing. The normalization is
 * intentionally simple — trim, collapse whitespace, lowercase. We
 * avoid aggressive stemming so that "install npm" and "npm install"
 * are NOT collapsed together; the user (or agent) is responsible for
 * writing canonical task text if they want bitwise parity.
 */
export function normalizeTaskText(taskText: string): string {
  return taskText.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Build the SORTED, DEDUPED set of `failure_signature` values across
 * the consulted records. This is the input that decouples the stable
 * trace from observation ids.
 */
export function consultedSignatureSet(
  records: readonly KnowledgeRecord[],
): string[] {
  const seen = new Set<string>();
  for (const record of records) {
    seen.add(record.failure_signature);
  }
  return [...seen].sort();
}

function stableHash(parts: readonly string[]): string {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(part);
    hash.update("\u0000");
  }
  return `trc-${hash.digest("hex").slice(0, 16)}`;
}

/**
 * Compute the stable operational trace ID for a consult input.
 *
 * The output shape matches the enforcement trace_id (`trc-` followed
 * by 16 hex chars), but the inputs are different: the stable trace
 * only depends on the request, the protocol key, and the sorted
 * consulted signatures — never on raw observation ids, missing
 * records, or the degraded flag.
 */
export function deriveStableTraceId(input: StableTraceInput): string {
  const signatures = consultedSignatureSet(input.records);
  return stableHash([
    "stable",
    input.request.project,
    input.request.agent_id,
    input.request.action_kind,
    input.request.shell ?? "",
    normalizeTaskText(input.request.task_text),
    CANONICAL_PROTOCOL_TOPIC_KEY,
    signatures.join("|"),
  ]);
}
