import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { KnowledgeRecordSchema } from "../../src/contracts/knowledgeRecord.js";
import { CANONICAL_PROTOCOL_TOPIC_KEY } from "../../src/contracts/topicKeys.js";

const REPO_ROOT = resolve(__dirname, "..", "..");

function readFixture(): unknown {
  const raw = readFileSync(
    resolve(REPO_ROOT, "fixtures/knowledge/sdd-spec-gherkin.json"),
    "utf8",
  );
  return JSON.parse(raw);
}

describe("sdd-spec-gherkin fixture", () => {
  it("parses against the KnowledgeRecord schema", () => {
    const record = KnowledgeRecordSchema.parse(readFixture());
    expect(record.agent_id).toBe("sdd-spec");
    expect(record.failure_kind).toBe("spec");
  });

  it("uses the canonical protocol topic key, not a v1 alias", () => {
    const record = KnowledgeRecordSchema.parse(readFixture());
    expect(record.canonical_protocol_topic_key).toBe(CANONICAL_PROTOCOL_TOPIC_KEY);
    expect(record.topic_key.startsWith("engram-rag/failures/")).toBe(true);
  });

  it("rule explicitly demands Given/When/Then scenarios", () => {
    const record = KnowledgeRecordSchema.parse(readFixture());
    const normalized = record.validated_solution.toLowerCase();
    expect(normalized).toContain("given/when/then");
    expect(normalized).toContain("scenario");
  });

  it("names gherkin and scenario as trigger terms", () => {
    const record = KnowledgeRecordSchema.parse(readFixture());
    const triggers = record.trigger_terms.map((t) => t.toLowerCase());
    expect(triggers).toContain("gherkin");
    expect(triggers).toContain("scenario");
  });
});
