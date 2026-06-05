import { z } from "zod";
import { CANONICAL_PROTOCOL_TOPIC_KEY } from "./topicKeys.js";

/**
 * Zod schema for a KnowledgeRecord.
 *
 * The schema mirrors the TypeScript shape in `rag-system/v2/design.md`
 * §2.2 and is the only validator used by the retrieval planner, the
 * fixtures, and (in later phases) the Engram adapter.
 */

export const AGENT_IDS = [
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
] as const;

export const FAILURE_KINDS = [
  "shell",
  "spec",
  "design",
  "verification",
  "convention",
  "dashboard",
  "workflow",
] as const;

export const VALIDATION_STATUSES = ["validated", "superseded", "draft"] as const;

export const AgentIdSchema = z.enum(AGENT_IDS);
export const FailureKindSchema = z.enum(FAILURE_KINDS);
export const ValidationStatusSchema = z.enum(VALIDATION_STATUSES);

export const KnowledgeRecordSchema = z
  .object({
    schema_version: z.literal("2.0"),
    topic_key: z.string().min(1, "topic_key is required"),
    canonical_protocol_topic_key: z.literal(CANONICAL_PROTOCOL_TOPIC_KEY),
    agent_id: z.union([AgentIdSchema, z.literal("cross-agent")]),
    failure_kind: FailureKindSchema,
    failure_signature: z.string().min(1, "failure_signature is required"),
    trigger_terms: z
      .array(z.string().min(1))
      .min(1, "trigger_terms must contain at least one term"),
    validated_solution: z
      .string()
      .min(1, "validated_solution is required and cannot be empty"),
    evidence_refs: z
      .array(z.string().min(1))
      .min(1, "evidence_refs must contain at least one reference"),
    validation_status: ValidationStatusSchema,
    last_validated_at: z
      .string()
      .datetime({ message: "last_validated_at must be an ISO 8601 timestamp" }),
  })
  .strict();

export type AgentId = z.infer<typeof AgentIdSchema>;
export type FailureKind = z.infer<typeof FailureKindSchema>;
export type ValidationStatus = z.infer<typeof ValidationStatusSchema>;
export type KnowledgeRecord = z.infer<typeof KnowledgeRecordSchema>;

/**
 * Parse and validate an unknown value as a KnowledgeRecord.
 * Throws a ZodError on failure with a path-rich message.
 */
export function parseKnowledgeRecord(input: unknown): KnowledgeRecord {
  return KnowledgeRecordSchema.parse(input);
}

/**
 * Safe variant: returns a discriminated result instead of throwing.
 * Useful in adapters and CLI scripts that want to log the error.
 */
export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export function safeParseKnowledgeRecord(
  input: unknown,
): ParseResult<KnowledgeRecord> {
  const result = KnowledgeRecordSchema.safeParse(input);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  return {
    ok: false,
    error: result.error.issues
      .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
      .join("; "),
  };
}
