import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  KnowledgeRecordSchema,
} from "../../src/contracts/knowledgeRecord.js";
import { CANONICAL_PROTOCOL_TOPIC_KEY } from "../../src/contracts/topicKeys.js";

const REPO_ROOT = resolve(__dirname, "..", "..");

function readFixture(): unknown {
  const raw = readFileSync(
    resolve(REPO_ROOT, "fixtures/knowledge/powershell-and.json"),
    "utf8",
  );
  return JSON.parse(raw);
}

describe("powershell-and fixture", () => {
  it("parses against the KnowledgeRecord schema", () => {
    const record = KnowledgeRecordSchema.parse(readFixture());
    expect(record.agent_id).toBe("sdd-apply");
    expect(record.failure_kind).toBe("shell");
  });

  it("uses the canonical protocol topic key, not a v1 alias", () => {
    const record = KnowledgeRecordSchema.parse(readFixture());
    expect(record.canonical_protocol_topic_key).toBe(CANONICAL_PROTOCOL_TOPIC_KEY);
    expect(record.topic_key.startsWith("engram-rag/failures/")).toBe(true);
  });

  it("documents the ; if ($?) { ... } solution explicitly", () => {
    const record = KnowledgeRecordSchema.parse(readFixture());
    expect(record.validated_solution).toContain("; if ($?) {");
    expect(record.validated_solution).toContain("}");
  });

  it("names PowerShell as a trigger term", () => {
    const record = KnowledgeRecordSchema.parse(readFixture());
    expect(record.trigger_terms.map((t) => t.toLowerCase())).toContain(
      "powershell",
    );
  });
});
