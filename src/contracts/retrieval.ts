import { z } from "zod";
import { AgentIdSchema } from "./knowledgeRecord.js";
import {
  CANONICAL_PROTOCOL_TOPIC_KEY,
  FORBIDDEN_TOPIC_ALIASES,
} from "./topicKeys.js";

/**
 * Zod schemas for the retrieval contract.
 *
 * A RetrievalRequest is what an agent emits before it acts.
 * A RetrievalPlan is what the planner produces for that request —
 * a deterministic description of the queries the agent must run,
 * with no live Engram calls. The planner is exercised by tests in
 * `test/retrieval/retrievalPlan.test.ts`.
 */

export const ACTION_KINDS = [
  "read",
  "write",
  "shell",
  "spec",
  "design",
  "verify",
  "review",
] as const;

export const SHELL_KINDS = ["powershell", "bash", "unknown"] as const;

export const ActionKindSchema = z.enum(ACTION_KINDS);
export const ShellKindSchema = z.enum(SHELL_KINDS);

export const RetrievalRequestSchema = z
  .object({
    project: z.string().min(1, "project is required"),
    agent_id: AgentIdSchema,
    task_text: z.string().min(1, "task_text is required"),
    action_kind: ActionKindSchema,
    cwd: z.string().min(1).optional(),
    files: z.array(z.string().min(1)).optional(),
    shell: ShellKindSchema.optional(),
  })
  .strict();

export const RetrievalSearchSchema = z
  .object({
    query: z.string().min(1, "query is required"),
    project: z.string().min(1),
    scope: z.literal("project"),
    limit: z.number().int().positive().max(50),
  })
  .strict();

export const RetrievalPlanSchema = z
  .object({
    context_query: z
      .object({
        project: z.string().min(1),
        scope: z.literal("project"),
      })
      .strict(),
    searches: z.array(RetrievalSearchSchema).min(1, "plan must include at least one search"),
    require_full_observation: z.boolean(),
    forbidden_topic_aliases: z
      .array(z.string().min(1))
      .min(1, "forbidden_topic_aliases must be non-empty"),
  })
  .strict();

export type ActionKind = z.infer<typeof ActionKindSchema>;
export type ShellKind = z.infer<typeof ShellKindSchema>;
export type RetrievalRequest = z.infer<typeof RetrievalRequestSchema>;
export type RetrievalSearch = z.infer<typeof RetrievalSearchSchema>;
export type RetrievalPlan = z.infer<typeof RetrievalPlanSchema>;

/**
 * Parse a RetrievalRequest from an unknown payload (e.g. CLI input or
 * a future MCP tool call).
 */
export function parseRetrievalRequest(input: unknown): RetrievalRequest {
  return RetrievalRequestSchema.parse(input);
}

/**
 * Parse a RetrievalPlan. Used by tests and by Phase 2 adapters.
 */
export function parseRetrievalPlan(input: unknown): RetrievalPlan {
  return RetrievalPlanSchema.parse(input);
}

/**
 * Build the canonical set of forbidden aliases for a plan. Always
 * returns the global v1 list from `topicKeys.ts` so plans cannot
 * drift from the live policy.
 */
export function defaultForbiddenTopicAliases(): string[] {
  return [...FORBIDDEN_TOPIC_ALIASES, CANONICAL_PROTOCOL_TOPIC_KEY];
}
