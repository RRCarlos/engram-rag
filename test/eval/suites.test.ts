import { readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { loadAllScenarios, loadScenarioFile, SCENARIOS_DIR } from "../../src/eval/suites.js";
import { parseKnowledgeRecord } from "../../src/contracts/knowledgeRecord.js";
import type { EvalScenario } from "../../src/eval/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..", "..");
const FIXTURE_DIR = resolve(REPO_ROOT, "fixtures", "knowledge");

function loadFixtureTopicKeys(): Set<string> {
  const files = readdirSync(FIXTURE_DIR).filter((name) => name.endsWith(".json"));
  const keys = new Set<string>();
  for (const file of files) {
    const raw = readFileSync(resolve(FIXTURE_DIR, file), "utf8");
    const record = parseKnowledgeRecord(JSON.parse(raw));
    keys.add(record.topic_key);
  }
  return keys;
}

function loadFixtureSignatures(): string {
  const files = readdirSync(FIXTURE_DIR).filter((name) => name.endsWith(".json"));
  const signatures: string[] = [];
  for (const file of files) {
    const raw = readFileSync(resolve(FIXTURE_DIR, file), "utf8");
    const record = parseKnowledgeRecord(JSON.parse(raw));
    signatures.push(record.failure_signature);
  }
  return signatures.join("\n");
}

describe("loadScenarioFile", () => {
  it("parses powershell-and.json into a valid EvalScenario", () => {
    const scenario = loadScenarioFile(resolve(SCENARIOS_DIR, "powershell-and.json"));
    expect(scenario.id).toBe("powershell-and");
    expect(scenario.agent_id).toBe("sdd-apply");
    expect(scenario.shell).toBe("powershell");
    expect(scenario.expected_record_topic_keys).toEqual([
      "engram-rag/failures/sdd-apply/powershell-and",
    ]);
  });

  it("rejects a scenario file with a missing required field", () => {
    // Build a minimal payload missing the `shell` field. We write to
    // a temp location, not the suite dir, to avoid touching the
    // committed scenario set.
    const tmpPath = join(tmpdir(), `eval-broken-${Date.now()}.json`);
    writeFileSync(
      tmpPath,
      JSON.stringify({
        id: "broken",
        description: "x",
        project: "engram-rag",
        agent_id: "sdd-apply",
        task_text: "x",
        action_kind: "shell",
        expected_record_topic_keys: ["engram-rag/failures/sdd-apply/powershell-and"],
        expected_applied_rules: [],
      }),
      "utf8",
    );
    try {
      expect(() => loadScenarioFile(tmpPath)).toThrow();
    } finally {
      unlinkSync(tmpPath);
    }
  });
});

describe("loadAllScenarios", () => {
  it("returns at least 5 scenarios (acceptance gate G1)", () => {
    const scenarios = loadAllScenarios();
    expect(scenarios.length).toBeGreaterThanOrEqual(5);
  });

  it("returns scenarios sorted by filename (deterministic order)", () => {
    const scenarios = loadAllScenarios();
    const ids = scenarios.map((s) => s.id);
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
  });

  it("every expected_record_topic_key references a real knowledge fixture", () => {
    const scenarios = loadAllScenarios();
    const knownKeys = loadFixtureTopicKeys();
    const missing: Array<{ scenario: string; topic_key: string }> = [];
    for (const s of scenarios) {
      for (const key of s.expected_record_topic_keys) {
        if (!knownKeys.has(key)) {
          missing.push({ scenario: s.id, topic_key: key });
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("every expected_applied_rules entry appears as a substring of at least one fixture failure_signature", () => {
    const scenarios = loadAllScenarios();
    const signatureBlob = loadFixtureSignatures();
    const orphans: Array<{ scenario: string; rule: string }> = [];
    for (const s of scenarios) {
      for (const rule of s.expected_applied_rules) {
        if (!signatureBlob.includes(rule)) {
          orphans.push({ scenario: s.id, rule });
        }
      }
    }
    expect(orphans).toEqual([]);
  });
});

describe("scenario ids and project names", () => {
  it("every scenario uses the engram-rag project", () => {
    const scenarios: EvalScenario[] = loadAllScenarios();
    for (const s of scenarios) {
      expect(s.project).toBe("engram-rag");
    }
  });

  it("every scenario has a non-empty id and description", () => {
    const scenarios = loadAllScenarios();
    for (const s of scenarios) {
      expect(s.id.length).toBeGreaterThan(0);
      expect(s.description.length).toBeGreaterThan(0);
    }
  });
});
