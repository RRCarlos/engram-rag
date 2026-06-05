import { describe, expect, it } from "vitest";
import {
  MemContextInputSchema,
  MemContextResultSchema,
  MemGetObservationInputSchema,
  MemObservationSchema,
  MemSaveInputSchema,
  MemSaveResultSchema,
  MemSearchInputSchema,
  MemSearchResultSchema,
  parseMemContextInput,
  parseMemGetObservationInput,
  parseMemSaveInput,
  parseMemSearchInput,
} from "../../src/engram/EngramTools.js";
import {
  KnowledgeRecordSchema,
  type KnowledgeRecord,
} from "../../src/contracts/knowledgeRecord.js";
import { CANONICAL_PROTOCOL_TOPIC_KEY } from "../../src/contracts/topicKeys.js";

/**
 * A valid KnowledgeRecord used as the seed for `mem_save` and
 * `mem_get_observation` round-trip tests. The shape is the same one
 * used in `test/contracts/knowledgeRecord.test.ts` so the schema
 * invariants are exercised with the same input the planner sees.
 */
function buildValidRecord(overrides: Partial<KnowledgeRecord> = {}): KnowledgeRecord {
  return KnowledgeRecordSchema.parse({
    schema_version: "2.0",
    topic_key: "engram-rag/failures/sdd-apply/powershell-and",
    canonical_protocol_topic_key: CANONICAL_PROTOCOL_TOPIC_KEY,
    agent_id: "sdd-apply",
    failure_kind: "shell",
    failure_signature: "&& in PowerShell command",
    trigger_terms: ["powershell", "&&", "shell-chain"],
    validated_solution: "Use `; if ($?) { ... }` instead of `&&` in PowerShell.",
    evidence_refs: ["docs/evidence/v1-forensics.md"],
    validation_status: "validated",
    last_validated_at: "2026-06-05T15:30:00.000Z",
    ...overrides,
  });
}

describe("EngramTools input schemas", () => {
  describe("mem_context", () => {
    it("accepts project scope with project and scope set", () => {
      const parsed = parseMemContextInput({
        project: "engram-rag",
        scope: "project",
      });
      expect(parsed.project).toBe("engram-rag");
      expect(parsed.scope).toBe("project");
    });

    it("accepts personal scope (the adapter is symmetric)", () => {
      const parsed = parseMemContextInput({
        project: "engram-rag",
        scope: "personal",
      });
      expect(parsed.scope).toBe("personal");
    });

    it("rejects an empty project", () => {
      const result = MemContextInputSchema.safeParse({
        project: "",
        scope: "project",
      });
      expect(result.success).toBe(false);
    });

    it("rejects an unknown scope literal", () => {
      const result = MemContextInputSchema.safeParse({
        project: "engram-rag",
        scope: "team",
      });
      expect(result.success).toBe(false);
    });

    it("rejects extra properties (strict mode)", () => {
      const result = MemContextInputSchema.safeParse({
        project: "engram-rag",
        scope: "project",
        rogue: true,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("mem_search", () => {
    it("accepts a fully valid input", () => {
      const parsed = parseMemSearchInput({
        query: "powershell &&",
        project: "engram-rag",
        scope: "project",
        limit: 5,
      });
      expect(parsed.limit).toBe(5);
      expect(parsed.scope).toBe("project");
    });

    it("rejects an empty query", () => {
      const result = MemSearchInputSchema.safeParse({
        query: "",
        project: "engram-rag",
        scope: "project",
        limit: 5,
      });
      expect(result.success).toBe(false);
    });

    it("rejects a non-positive limit", () => {
      const result = MemSearchInputSchema.safeParse({
        query: "x",
        project: "engram-rag",
        scope: "project",
        limit: 0,
      });
      expect(result.success).toBe(false);
    });

    it("rejects a non-integer limit", () => {
      const result = MemSearchInputSchema.safeParse({
        query: "x",
        project: "engram-rag",
        scope: "project",
        limit: 1.5,
      });
      expect(result.success).toBe(false);
    });

    it("rejects a limit above the planner cap (50)", () => {
      const result = MemSearchInputSchema.safeParse({
        query: "x",
        project: "engram-rag",
        scope: "project",
        limit: 51,
      });
      expect(result.success).toBe(false);
    });

    it("rejects a personal scope that leaks a project key", () => {
      // The schema permits this — the adapter enforces the
      // "personal projects are null/empty" rule — but the schema
      // must still reject unknown scope literals.
      const result = MemSearchInputSchema.safeParse({
        query: "x",
        project: "engram-rag",
        scope: "team",
        limit: 1,
      });
      expect(result.success).toBe(false);
    });

    it("rejects extra properties (strict mode)", () => {
      const result = MemSearchInputSchema.safeParse({
        query: "x",
        project: "engram-rag",
        scope: "project",
        limit: 1,
        offset: 10,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("mem_get_observation", () => {
    it("accepts a positive integer id", () => {
      const parsed = parseMemGetObservationInput({ id: 728 });
      expect(parsed.id).toBe(728);
    });

    it("rejects a non-positive id", () => {
      const result = MemGetObservationInputSchema.safeParse({ id: 0 });
      expect(result.success).toBe(false);
    });

    it("rejects a non-integer id", () => {
      const result = MemGetObservationInputSchema.safeParse({ id: 1.5 });
      expect(result.success).toBe(false);
    });

    it("rejects a string id (the schema requires a number)", () => {
      const result = MemGetObservationInputSchema.safeParse({ id: "728" });
      expect(result.success).toBe(false);
    });

    it("rejects extra properties (strict mode)", () => {
      const result = MemGetObservationInputSchema.safeParse({
        id: 1,
        include_content: false,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("mem_save", () => {
    it("accepts a valid KnowledgeRecord as the save payload", () => {
      const record = buildValidRecord();
      const parsed = parseMemSaveInput(record);
      expect(parsed.topic_key).toBe(record.topic_key);
    });

    it("rejects a record with a non-canonical canonical_protocol_topic_key", () => {
      // Construct the broken record directly so we do not run it
      // through `buildValidRecord` (which would reject it before
      // the test gets a chance to assert against the save schema).
      const record = {
        ...buildValidRecord(),
        canonical_protocol_topic_key: "engram-rag/agent-rigor-protocol/v9-wrong",
      };
      const result = MemSaveInputSchema.safeParse(record);
      expect(result.success).toBe(false);
    });

    it("rejects a record missing validated_solution", () => {
      const record = buildValidRecord();
      const broken = { ...record, validated_solution: "" };
      const result = MemSaveInputSchema.safeParse(broken);
      expect(result.success).toBe(false);
    });
  });
});

describe("EngramTools output schemas", () => {
  it("validates a mem_context result shape", () => {
    const result = MemContextResultSchema.parse({
      observations: [
        { id: 1, topic_key: "engram-rag/failures/x/y", summary: "summary" },
      ],
      generated_at: "2026-06-05T15:30:00.000Z",
    });
    expect(result.observations[0]?.id).toBe(1);
  });

  it("rejects a mem_context result with a non-ISO generated_at", () => {
    const result = MemContextResultSchema.safeParse({
      observations: [],
      generated_at: "now",
    });
    expect(result.success).toBe(false);
  });

  it("validates a mem_search result shape", () => {
    const parsed = MemSearchResultSchema.parse({
      id: 7,
      topic_key: "engram-rag/failures/sdd-apply/powershell-and",
      agent_id: "sdd-apply",
      failure_signature: "&& in PowerShell",
      trigger_terms: ["powershell", "&&"],
      score: 0.91,
    });
    expect(parsed.score).toBeCloseTo(0.91);
  });

  it("rejects a mem_search result with an empty trigger_terms array", () => {
    const result = MemSearchResultSchema.safeParse({
      id: 7,
      topic_key: "k",
      agent_id: "sdd-apply",
      failure_signature: "sig",
      trigger_terms: [],
      score: 1,
    });
    expect(result.success).toBe(false);
  });

  it("validates a mem_get_observation result that wraps a full KnowledgeRecord", () => {
    const record = buildValidRecord();
    const parsed = MemObservationSchema.parse({
      id: 42,
      topic_key: record.topic_key,
      content: record,
      fetched_at: "2026-06-05T15:30:00.000Z",
    });
    expect(parsed.content.validated_solution).toBe(record.validated_solution);
  });

  it("rejects a mem_get_observation result whose content is not a valid KnowledgeRecord", () => {
    const result = MemObservationSchema.safeParse({
      id: 42,
      topic_key: "x",
      content: { ...buildValidRecord(), validated_solution: "" },
      fetched_at: "2026-06-05T15:30:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("validates a mem_save result shape", () => {
    const parsed = MemSaveResultSchema.parse({
      id: 99,
      topic_key: "engram-rag/failures/sdd-apply/powershell-and",
      created_at: "2026-06-05T15:30:00.000Z",
    });
    expect(parsed.id).toBe(99);
  });
});

describe("EngramTools parser helpers", () => {
  it("parseMemContextInput returns the typed value on success", () => {
    const value = parseMemContextInput({ project: "p", scope: "project" });
    expect(value.scope).toBe("project");
  });

  it("parseMemContextInput throws on invalid input", () => {
    expect(() => parseMemContextInput({ project: "" })).toThrow();
  });

  it("parseMemSearchInput returns the typed value on success", () => {
    const value = parseMemSearchInput({
      query: "q",
      project: "p",
      scope: "personal",
      limit: 3,
    });
    expect(value.limit).toBe(3);
  });

  it("parseMemSearchInput throws on invalid input", () => {
    expect(() =>
      parseMemSearchInput({ query: "q", project: "p", scope: "x", limit: 1 }),
    ).toThrow();
  });

  it("parseMemGetObservationInput returns the typed value on success", () => {
    const value = parseMemGetObservationInput({ id: 5 });
    expect(value.id).toBe(5);
  });

  it("parseMemGetObservationInput throws on invalid input", () => {
    expect(() => parseMemGetObservationInput({ id: -1 })).toThrow();
  });

  it("parseMemSaveInput returns the typed value on success", () => {
    const record = buildValidRecord();
    const value = parseMemSaveInput(record);
    expect(value.topic_key).toBe(record.topic_key);
  });

  it("parseMemSaveInput throws on invalid input", () => {
    expect(() => parseMemSaveInput({})).toThrow();
  });
});
