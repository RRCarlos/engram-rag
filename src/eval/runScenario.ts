/**
 * Phase 4 — scenario runner.
 *
 * Takes a single `EvalScenario` and drives the retrieval stack
 * against the fake Engram adapter (which is wired with the live
 * knowledge fixtures in CI). The runner owns the latency
 * budget: it computes a Score via the pure scorer and reports
 * `latency_breached` so the eval report is debuggable.
 *
 * In a later phase, the runner will support a "live" adapter
 * that hits the real Engram MCP. For now, only the fake adapter
 * is implemented, because Phase 4 is the verification harness
 * for the retrieval contract itself; the live adapter is
 * Phase 5.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { parseKnowledgeRecord, type KnowledgeRecord } from "../contracts/knowledgeRecord.js";
import type { RetrievalRequest } from "../contracts/retrieval.js";
import { createFakeAdapter } from "../engram/fakeEngramAdapter.js";
import { runPreflight } from "../engram/runPreflight.js";
import { scoreRetrieval } from "./score.js";
import type { EvalScenario, Score } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const FIXTURE_DIR = resolve(__dirname, "..", "..", "fixtures", "knowledge");

/**
 * Load every knowledge fixture from the `fixtures/knowledge`
 * directory. Synchronous, small directory, no IO cost concerns.
 */
export function loadAllKnowledgeRecords(): KnowledgeRecord[] {
  const files = readdirSync(FIXTURE_DIR).filter((name) => name.endsWith(".json"));
  return files.map((file) => {
    const raw = readFileSync(resolve(FIXTURE_DIR, file), "utf8");
    return parseKnowledgeRecord(JSON.parse(raw));
  });
}

/**
 * Build a `RetrievalRequest` from an `EvalScenario`. The
 * `shell` field is set only when the scenario carries a
 * concrete value (i.e. not "unknown"); the harness needs
 * the request to look exactly like what a real agent would
 * emit.
 */
function scenarioToRequest(scenario: EvalScenario): RetrievalRequest {
  const request: RetrievalRequest = {
    project: scenario.project,
    agent_id: scenario.agent_id,
    task_text: scenario.task_text,
    action_kind: scenario.action_kind,
  };
  if (scenario.shell !== "unknown") {
    request.shell = scenario.shell;
  }
  return request;
}

/**
 * Run a single scenario. Returns a `Score` carrying the
 * retrieval output, the scoring decision, and the latency
 * breach flag. Does not throw on a degraded retrieval —
 * the score is the report.
 */
export async function runScenario(scenario: EvalScenario): Promise<Score> {
  const records = loadAllKnowledgeRecords();
  const adapter = createFakeAdapter(records);
  const request = scenarioToRequest(scenario);
  const result = await runPreflight(request, adapter);

  return scoreRetrieval({
    scenario_id: scenario.id,
    expected_record_topic_keys: scenario.expected_record_topic_keys,
    retrieved_record_topic_keys: result.records.map((record) => record.topic_key),
    expected_applied_rules: scenario.expected_applied_rules,
    retrieved_applied_rules: result.applied_rules,
    latency_ms: result.latency_ms,
    latency_budget_ms: scenario.max_latency_ms,
    degraded: result.degraded,
  });
}
