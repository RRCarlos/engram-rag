import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { loadAllKnowledgeRecords, runScenario } from "../../src/eval/runScenario.js";
import { parseEvalReport, parseEvalScenario } from "../../src/eval/types.js";
import type { EvalScenario } from "../../src/eval/types.js";
import { runEvalCli } from "../../src/cli/eval.js";

const REPO_ROOT = resolve(__dirname, "..", "..");
const REPORT_PATH = resolve(REPO_ROOT, "reports/phase4/eval-report.json");

function minimalScenario(overrides: Partial<EvalScenario> = {}): EvalScenario {
  return parseEvalScenario({
    id: "minimal",
    description: "Synthetic scenario for unit tests.",
    project: "engram-rag",
    agent_id: "sdd-apply",
    task_text: "Run a PowerShell command without using `&&`.",
    action_kind: "shell",
    shell: "powershell",
    expected_record_topic_keys: ["engram-rag/failures/sdd-apply/powershell-and"],
    expected_applied_rules: [
      "Used `&&` to chain commands inside a PowerShell bash tool call.",
    ],
    max_latency_ms: 5000,
    ...overrides,
  });
}

describe("loadAllKnowledgeRecords", () => {
  it("returns at least the 3 known fixtures (powershell, gherkin, skill-frontmatter)", () => {
    const records = loadAllKnowledgeRecords();
    const keys = records.map((r) => r.topic_key);
    expect(keys).toContain("engram-rag/failures/sdd-apply/powershell-and");
    expect(keys).toContain("engram-rag/failures/sdd-spec/gherkin-missing");
    expect(keys).toContain("engram-rag/failures/sdd-apply/skill-frontmatter");
  });

  it("every loaded record is a valid KnowledgeRecord (parseable)", () => {
    const records = loadAllKnowledgeRecords();
    expect(records.length).toBeGreaterThan(0);
    for (const record of records) {
      expect(record.topic_key.length).toBeGreaterThan(0);
      expect(record.trigger_terms.length).toBeGreaterThan(0);
    }
  });
});

describe("runScenario", () => {
  it("scores the powershell-and scenario as passing against the fake adapter", async () => {
    const score = await runScenario(minimalScenario());
    expect(score.pass).toBe(true);
    expect(score.top_k_hit_rate.k3).toBe(1);
    expect(score.missing_expected_records).toEqual([]);
    expect(score.missing_expected_rules).toEqual([]);
    expect(score.degraded).toBe(false);
    expect(score.latency_breached).toBe(false);
  });

  it("records the latency budget on the score", async () => {
    const score = await runScenario(minimalScenario({ max_latency_ms: 1234 }));
    expect(score.latency_budget_ms).toBe(1234);
  });

  it("fails when the expected record cannot be retrieved", async () => {
    const score = await runScenario(
      minimalScenario({
        expected_record_topic_keys: ["engram-rag/failures/no-such-record"],
      }),
    );
    expect(score.pass).toBe(false);
    expect(score.missing_expected_records).toEqual(["engram-rag/failures/no-such-record"]);
  });

  it("fails when the latency budget is breached (zero ms)", async () => {
    const score = await runScenario(minimalScenario({ max_latency_ms: 0.0001 }));
    expect(score.latency_breached).toBe(true);
    expect(score.pass).toBe(false);
  });
});

describe("runEvalCli", () => {
  // Clean up any report that the CLI writes so we can assert it
  // gets regenerated. The .gitkeep is left in place.
  if (existsSync(REPORT_PATH)) {
    unlinkSync(REPORT_PATH);
  }

  it("writes an EvalReport to reports/phase4/eval-report.json", async () => {
    const result = await runEvalCli();
    expect(existsSync(REPORT_PATH)).toBe(true);
    const raw = JSON.parse(readFileSync(REPORT_PATH, "utf8"));
    const report = parseEvalReport(raw);
    expect(report.suite).toBe("phase4-default");
    expect(report.adapter).toBe("fake");
    expect(report.scenarios_total).toBeGreaterThanOrEqual(5);
    expect(report.scores.length).toBe(report.scenarios_total);
    // The report is well-formed: every score has the expected
    // scenario id and a numeric top_k_hit_rate.
    for (const score of report.scores) {
      expect(score.scenario_id.length).toBeGreaterThan(0);
      expect(score.top_k_hit_rate.k3).toBeGreaterThanOrEqual(0);
      expect(score.top_k_hit_rate.k3).toBeLessThanOrEqual(1);
    }
  });

  it("exits 0 when every scenario passes against the live fixtures", async () => {
    const result = await runEvalCli();
    expect(result.exitCode).toBe(0);
    expect(result.report.scenarios_passed).toBe(result.report.scenarios_total);
    expect(result.report.scenarios_failed).toBe(0);
  });

  it("stdout summarizes the suite, the metrics, and the per-scenario verdict", async () => {
    const result = await runEvalCli();
    expect(result.stdout).toContain("Phase 4 eval");
    expect(result.stdout).toContain("scenarios:");
    expect(result.stdout).toContain("metrics:");
    expect(result.stdout).toMatch(/\[PASS\] powershell-and/);
  });

  it("includes the canonical protocol topic key in the metrics block", async () => {
    const result = await runEvalCli();
    expect(result.report.metrics.canonical_topic_key).toBe(
      "engram-rag/agent-rigor-protocol/v2",
    );
  });
});
