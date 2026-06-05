import { describe, expect, it } from "vitest";
import {
  KnowledgeRecordSchema,
  parseKnowledgeRecord,
  safeParseKnowledgeRecord,
} from "../../src/contracts/knowledgeRecord.js";
import { CANONICAL_PROTOCOL_TOPIC_KEY } from "../../src/contracts/topicKeys.js";

const baseValid = {
  schema_version: "2.0" as const,
  topic_key: "engram-rag/failures/sdd-apply/powershell-and",
  canonical_protocol_topic_key: CANONICAL_PROTOCOL_TOPIC_KEY,
  agent_id: "sdd-apply" as const,
  failure_kind: "shell" as const,
  failure_signature: "&& in PowerShell command",
  trigger_terms: ["powershell", "&&", "cd foo && npm install"],
  validated_solution: "Use `; if ($?) { ... }` instead of `&&` in PowerShell.",
  evidence_refs: ["docs/evidence/v1-forensics.md"],
  validation_status: "validated" as const,
  last_validated_at: "2026-06-05T15:00:00.000Z",
};

describe("knowledgeRecord", () => {
  it("accepts a fully valid record", () => {
    const result = KnowledgeRecordSchema.parse(baseValid);
    expect(result.topic_key).toBe(baseValid.topic_key);
  });

  it("rejects records missing validated_solution", () => {
    const { validated_solution: _drop, ...missingSolution } = baseValid;
    const result = safeParseKnowledgeRecord(missingSolution);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/validated_solution/);
    }
  });

  it("rejects records missing evidence_refs", () => {
    const broken = { ...baseValid, evidence_refs: [] };
    const result = safeParseKnowledgeRecord(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/evidence_refs/);
    }
  });

  it("rejects records with an empty validated_solution", () => {
    const result = safeParseKnowledgeRecord({ ...baseValid, validated_solution: "" });
    expect(result.ok).toBe(false);
  });

  it("rejects a non-canonical canonical_protocol_topic_key", () => {
    const result = safeParseKnowledgeRecord({
      ...baseValid,
      canonical_protocol_topic_key: "pattern/agent-rigor-protocol",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown failure_kind", () => {
    const result = safeParseKnowledgeRecord({
      ...baseValid,
      failure_kind: "totally-fake" as unknown as "shell",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a non-ISO last_validated_at", () => {
    const result = safeParseKnowledgeRecord({
      ...baseValid,
      last_validated_at: "yesterday",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown agent_id", () => {
    const result = safeParseKnowledgeRecord({
      ...baseValid,
      agent_id: "made-up-agent" as unknown as "sdd-apply",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown validation_status", () => {
    const result = safeParseKnowledgeRecord({
      ...baseValid,
      validation_status: "guessed" as unknown as "validated",
    });
    expect(result.ok).toBe(false);
  });

  it("parseKnowledgeRecord throws ZodError on invalid input", () => {
    expect(() => parseKnowledgeRecord({ ...baseValid, schema_version: "1.0" })).toThrow();
  });

  it("rejects unexpected extra properties (strict mode)", () => {
    const result = safeParseKnowledgeRecord({
      ...baseValid,
      rogue_field: "nope",
    });
    expect(result.ok).toBe(false);
  });
});
