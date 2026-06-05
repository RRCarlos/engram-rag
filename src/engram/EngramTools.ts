import { z } from "zod";
import { KnowledgeRecordSchema } from "../contracts/knowledgeRecord.js";

/**
 * Engram MCP tool contract for the engram-rag preflight adapter.
 *
 * This module defines the SHAPE of every call that the agent
 * (or a fake adapter, or a live adapter) makes against the Engram
 * MCP server. It composes with the Phase 1 contracts
 * (`RetrievalRequest`, `RetrievalPlan`, `KnowledgeRecord`) and
 * does NOT introduce new dependencies.
 *
 * The four tools correspond to the Engram MCP server's public
 * surface:
 *
 *   - `mem_context`        — fetch the recent session context
 *   - `mem_search`         — full-text search over stored observations
 *   - `mem_get_observation`— fetch a single observation by id
 *   - `mem_save`           — persist a new KnowledgeRecord
 *
 * Live MCP is intentionally NOT wired in this PR. The fake adapter
 * (`src/engram/fakeEngramAdapter.ts`) is the only adapter exercised
 * by tests, and the guardrail
 * (`test/guardrails/noLiveMcpInTests.test.ts`) fails the build if
 * anyone imports `@modelcontextprotocol/*` from `test/` or `src/`.
 *
 * Design contract: `rag-system/v2/design.md` §4.
 */

// ---------------------------------------------------------------------------
// Scopes — mirror the Engram MCP server's "project" / "personal" split.
// ---------------------------------------------------------------------------

export const MEM_SCOPES = ["project", "personal"] as const;
export const MemScopeSchema = z.enum(MEM_SCOPES);
export type MemScope = z.infer<typeof MemScopeSchema>;

// ---------------------------------------------------------------------------
// Input schemas — the contract a caller MUST satisfy.
// ---------------------------------------------------------------------------

/**
 * `mem_context` input. Mirrors `RetrievalPlan.context_query` but also
 * accepts the `personal` scope (the planner in Phase 1 only uses
 * `project`, but the adapter is symmetric so it can serve future
 * `personal`-scoped flows without a breaking change).
 */
export const MemContextInputSchema = z
  .object({
    project: z.string().min(1, "project is required"),
    scope: MemScopeSchema,
  })
  .strict();
export type MemContextInput = z.infer<typeof MemContextInputSchema>;

/**
 * `mem_search` input. Mirrors `RetrievalSearch` and additionally
 * allows the `personal` scope. The `limit` cap matches the planner's
 * schema (max 50) so an adapter cannot be flooded with oversize
 * requests.
 */
export const MemSearchInputSchema = z
  .object({
    query: z.string().min(1, "query is required"),
    project: z.string().min(1, "project is required"),
    scope: MemScopeSchema,
    limit: z.number().int().positive().max(50, "limit must be <= 50"),
  })
  .strict();
export type MemSearchInput = z.infer<typeof MemSearchInputSchema>;

/**
 * `mem_get_observation` input. The Engram MCP server addresses
 * observations by a positive integer id (see Engram observation
 * `#728` cited in `docs/evidence/v1-forensics.md`).
 */
export const MemGetObservationInputSchema = z
  .object({
    id: z.number().int().positive("id must be a positive integer"),
  })
  .strict();
export type MemGetObservationInput = z.infer<typeof MemGetObservationInputSchema>;

/**
 * `mem_save` input. Re-uses the strict `KnowledgeRecordSchema` from
 * Phase 1. We do NOT relax the schema for the adapter — a record
 * that cannot survive the contract cannot be saved.
 */
export const MemSaveInputSchema = KnowledgeRecordSchema;
export type MemSaveInput = z.infer<typeof MemSaveInputSchema>;

// ---------------------------------------------------------------------------
// Output schemas — the contract an adapter MUST return.
// ---------------------------------------------------------------------------

/**
 * Summary of a recent observation returned by `mem_context`. The
 * `summary` is a short string for preflight inspection; the agent
 * fetches the full content with `mem_get_observation` when it
 * decides a record is relevant.
 */
export const MemContextObservationSchema = z
  .object({
    id: z.number().int().positive(),
    topic_key: z.string().min(1),
    summary: z.string().min(1),
  })
  .strict();

export const MemContextResultSchema = z
  .object({
    observations: z.array(MemContextObservationSchema),
    generated_at: z
      .string()
      .datetime({ message: "generated_at must be an ISO 8601 timestamp" }),
  })
  .strict();
export type MemContextObservation = z.infer<typeof MemContextObservationSchema>;
export type MemContextResult = z.infer<typeof MemContextResultSchema>;

/**
 * A single hit from `mem_search`. The `score` is adapter-defined
 * (FTS5 rank in the live adapter, deterministic in the fake). The
 * `trigger_terms` are echoed so the planner can correlate which
 * terms matched.
 */
export const MemSearchResultSchema = z
  .object({
    id: z.number().int().positive(),
    topic_key: z.string().min(1),
    agent_id: z.string().min(1),
    failure_signature: z.string().min(1),
    trigger_terms: z.array(z.string().min(1)).min(1),
    score: z.number(),
  })
  .strict();
export type MemSearchResult = z.infer<typeof MemSearchResultSchema>;

/**
 * The full record returned by `mem_get_observation`. The `content`
 * field carries the validated `KnowledgeRecord` so the agent never
 * has to re-parse the body.
 */
export const MemObservationSchema = z
  .object({
    id: z.number().int().positive(),
    topic_key: z.string().min(1),
    content: KnowledgeRecordSchema,
    fetched_at: z
      .string()
      .datetime({ message: "fetched_at must be an ISO 8601 timestamp" }),
  })
  .strict();
export type MemObservation = z.infer<typeof MemObservationSchema>;

/**
 * The result of `mem_save`. The id is assigned by the adapter (in
 * the fake it is the next monotonic integer; in live MCP it comes
 * from the Engram SQLite sequence).
 */
export const MemSaveResultSchema = z
  .object({
    id: z.number().int().positive(),
    topic_key: z.string().min(1),
    created_at: z
      .string()
      .datetime({ message: "created_at must be an ISO 8601 timestamp" }),
  })
  .strict();
export type MemSaveResult = z.infer<typeof MemSaveResultSchema>;

// ---------------------------------------------------------------------------
// Interface — every adapter (fake, live, future) implements this.
// ---------------------------------------------------------------------------

/**
 * The contract every Engram adapter MUST implement.
 *
 * Adapters may additionally expose helpers (e.g. `getCallLog()` on
 * the fake) but the four async methods below are the only surface
 * the preflight runner relies on.
 */
export interface EngramTools {
  mem_context(input: MemContextInput): Promise<MemContextResult>;
  mem_search(input: MemSearchInput): Promise<MemSearchResult[]>;
  mem_get_observation(input: MemGetObservationInput): Promise<MemObservation>;
  mem_save(input: MemSaveInput): Promise<MemSaveResult>;
}

// ---------------------------------------------------------------------------
// Parsers — strict parse helpers exported for the runner and CLI.
// ---------------------------------------------------------------------------

export function parseMemContextInput(input: unknown): MemContextInput {
  return MemContextInputSchema.parse(input);
}

export function parseMemSearchInput(input: unknown): MemSearchInput {
  return MemSearchInputSchema.parse(input);
}

export function parseMemGetObservationInput(
  input: unknown,
): MemGetObservationInput {
  return MemGetObservationInputSchema.parse(input);
}

export function parseMemSaveInput(input: unknown): MemSaveInput {
  return MemSaveInputSchema.parse(input);
}
