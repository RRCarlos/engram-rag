import { z } from "zod";

/**
 * Shared Zod schemas for the skills layer (Phase 3).
 *
 * Both `patchSkill` and `verifySkill` return structured results that
 * the CLI consumes. Keeping the schemas here means the renderer, the
 * patcher, the verifier, the CLI, and the tests all parse the same
 * shape — no silent drift between modules.
 */

export const AgentIdSchema = z.enum([
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
]);

export type AgentId = z.infer<typeof AgentIdSchema>;

/**
 * Result of patching a single skill's content. `patchSkill` is pure,
 * so it returns the candidate content + a flag telling the caller
 * whether the content actually changed.
 */
export const PatchResultSchema = z.object({
  content: z.string(),
  changed: z.boolean(),
  reason: z.string(),
});
export type PatchResult = z.infer<typeof PatchResultSchema>;

/**
 * Result of verifying a single skill's content. `ok` is true iff
 * `errors` is empty. `warnings` never fail the verify but are surfaced
 * for the operator (e.g. "block present but missing canonical topic").
 */
export const SkillVerificationSchema = z.object({
  ok: z.boolean(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
});
export type SkillVerification = z.infer<typeof SkillVerificationSchema>;
