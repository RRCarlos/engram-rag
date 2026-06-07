import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync as readFixture } from "node:fs";
import { parseKnowledgeRecord, type KnowledgeRecord } from "../../src/contracts/knowledgeRecord.js";
import { CANONICAL_PROTOCOL_TOPIC_KEY } from "../../src/contracts/topicKeys.js";
import type { RetrievalRequest } from "../../src/contracts/retrieval.js";
import { createFakeAdapter } from "../../src/engram/fakeEngramAdapter.js";
import {
  createOperationalMetricsState,
  defaultOperationalMetricsPath,
  loadOperationalMetricsState,
  OPERATIONAL_METRICS_SCHEMA_VERSION,
  saveOperationalMetricsState,
  type OperationalMetricsPersistShape,
} from "../../src/mcp/operationalMetrics.js";
import { runPreflight } from "../../src/engram/runPreflight.js";

function fixture(path: string): KnowledgeRecord {
  const url = new URL(`../../fixtures/knowledge/${path}`, import.meta.url);
  return parseKnowledgeRecord(JSON.parse(readFileSync(url, "utf8")));
}

const powershellAndRequest: RetrievalRequest = {
  project: "engram-rag",
  agent_id: "sdd-apply",
  task_text: "Run `cd foo && npm install` in PowerShell.",
  action_kind: "shell",
  shell: "powershell",
};

function buildLearnInput(overrides: Partial<KnowledgeRecord> = {}): KnowledgeRecord {
  return parseKnowledgeRecord({
    schema_version: "2.0",
    topic_key: "engram-rag/failures/sdd-apply/operational-learn",
    canonical_protocol_topic_key: CANONICAL_PROTOCOL_TOPIC_KEY,
    agent_id: "sdd-apply",
    failure_kind: "shell",
    failure_signature: "operational learn signature",
    trigger_terms: ["operational", "mcp", "learn"],
    validated_solution: "Recorded by error_learn tool.",
    evidence_refs: ["engram://observation/test"],
    validation_status: "validated",
    last_validated_at: "2026-06-07T10:00:00.000Z",
    ...overrides,
  });
}

let tmpDir: string;
beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "engram-metrics-"));
});
afterEach(() => {
  if (existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe("loadOperationalMetricsState: missing or corrupt files", () => {
  it("returns a fresh state when the file does not exist", () => {
    const state = loadOperationalMetricsState(join(tmpDir, "missing.json"));
    expect(state.snapshot()).toEqual({
      preflight_coverage: 0,
      retrieval_hit_rate: 0,
      application_rate: 0,
      repeat_error_rate: 0,
      prevention_rate: 0,
      total_consults: 0,
      total_learns: 0,
    });
  });

  it("returns a fresh state when the file contains invalid JSON", () => {
    const path = join(tmpDir, "bad.json");
    writeFileSync(path, "{ this is not json", "utf8");
    const state = loadOperationalMetricsState(path);
    expect(state.snapshot().total_consults).toBe(0);
    // The corrupt file is NOT deleted; operators can inspect it.
    expect(existsSync(path)).toBe(true);
  });

  it("returns a fresh state when the shape does not match the schema", () => {
    const path = join(tmpDir, "wrong-shape.json");
    writeFileSync(path, JSON.stringify({ schema_version: "9.9" }), "utf8");
    const state = loadOperationalMetricsState(path);
    expect(state.snapshot().total_consults).toBe(0);
  });
});

describe("saveOperationalMetricsState", () => {
  it("creates the parent directory and writes a valid JSON file", () => {
    const path = join(tmpDir, "nested", "metrics.json");
    const state = createOperationalMetricsState();
    saveOperationalMetricsState(path, state);
    expect(existsSync(path)).toBe(true);
    const parsed = JSON.parse(readFileSync(path, "utf8")) as OperationalMetricsPersistShape;
    expect(parsed.schema_version).toBe(OPERATIONAL_METRICS_SCHEMA_VERSION);
    expect(parsed.total_consults).toBe(0);
  });

  it("materializes seen_failure_signatures as a sorted array", () => {
    const path = join(tmpDir, "metrics.json");
    const state = createOperationalMetricsState();
    state.recordLearn(buildLearnInput({ failure_signature: "bravo" }));
    state.recordLearn(buildLearnInput({ failure_signature: "alpha" }));
    saveOperationalMetricsState(path, state);
    const parsed = JSON.parse(readFileSync(path, "utf8")) as OperationalMetricsPersistShape;
    expect(parsed.seen_failure_signatures).toEqual(["alpha", "bravo"]);
    expect(parsed.total_learns).toBe(2);
  });

  it("throws when the parent path contains an invalid character (cross-platform)", () => {
    // Both POSIX and Windows reject NUL bytes in paths. The save
    // function must surface the error so the caller (the MCP
    // server) can log and continue.
    const path = "\u0000/cannot-create/metrics.json";
    const state = createOperationalMetricsState();
    expect(() => saveOperationalMetricsState(path, state)).toThrow();
  });
});

describe("round-trip persistence", () => {
  it("survives save + load with the same counters and signatures", () => {
    const path = join(tmpDir, "metrics.json");
    const original = createOperationalMetricsState();
    original.recordConsult({
      request: powershellAndRequest,
      records: [fixture("powershell-and.json")],
      applied_rules: ["powershell-and"],
      consulted_ids: [1],
      quarantined_records: [],
      correction_candidates: ["cmd1; if ($?) { cmd2 }"],
      missing_expected_records: [],
      latency_ms: 1,
      degraded: false,
      enforcement: {
        outcome: "correct",
        reason: "test",
        consulted_ids: [1],
        missing_expected_records: [],
        quarantined_records: [],
        trace_id: "trc-aaaaaaaaaaaaaaaa",
        stable_trace_id: "trc-bbbbbbbbbbbbbbbb",
      },
    });
    original.recordLearn(buildLearnInput({ failure_signature: "first" }));
    original.recordLearn(buildLearnInput({ failure_signature: "first" }));
    original.recordLearn(buildLearnInput({ failure_signature: "second" }));
    saveOperationalMetricsState(path, original);
    const reloaded = loadOperationalMetricsState(path);
    const snap = reloaded.snapshot();
    expect(snap.total_consults).toBe(1);
    expect(snap.total_learns).toBe(3);
    expect(snap.repeat_error_rate).toBeCloseTo(1 / 3, 5);
    expect(snap.prevention_rate).toBe(1); // the consult was "correct"
  });

  it("survives a process restart: counter mutations are reflected on a fresh load", async () => {
    const path = join(tmpDir, "metrics.json");
    // Process 1: persist after a consult + learn.
    const first = createOperationalMetricsState();
    const adapter = createFakeAdapter([fixture("powershell-and.json")]);
    const result1 = await runPreflight(powershellAndRequest, adapter);
    first.recordConsult(result1);
    first.recordLearn(buildLearnInput());
    saveOperationalMetricsState(path, first);
    // Process 2: load and continue.
    const second = loadOperationalMetricsState(path);
    second.recordConsult(await runPreflight(powershellAndRequest, createFakeAdapter([fixture("powershell-and.json")])));
    second.recordLearn(buildLearnInput());
    const snap = second.snapshot();
    expect(snap.total_consults).toBe(2);
    expect(snap.total_learns).toBe(2);
  });
});

describe("defaultOperationalMetricsPath", () => {
  it("returns the override when ENGRAM_METRICS_PATH is set", () => {
    const result = defaultOperationalMetricsPath(
      { ENGRAM_METRICS_PATH: "/tmp/custom.json" },
      "/irrelevant",
    );
    expect(result).toBe("/tmp/custom.json");
  });

  it("ignores empty ENGRAM_METRICS_PATH values", () => {
    const result = defaultOperationalMetricsPath(
      { ENGRAM_METRICS_PATH: "" },
      "/tmp/cwd",
    );
    expect(result).toBe("/tmp/cwd/.engram/metrics.json");
  });

  it("returns <cwd>/.engram/metrics.json by default", () => {
    const result = defaultOperationalMetricsPath({}, "/repo");
    expect(result).toBe("/repo/.engram/metrics.json");
  });
});

describe("toJSON serialization", () => {
  it("includes the schema_version and saved_at fields", () => {
    const fixedNow = () => new Date("2026-06-07T12:00:00.000Z");
    const state = createOperationalMetricsState({ now: fixedNow });
    const json = state.toJSON();
    expect(json.schema_version).toBe("1.0");
    expect(json.saved_at).toBe("2026-06-07T12:00:00.000Z");
  });
});
