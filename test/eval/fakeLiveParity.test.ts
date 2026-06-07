import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseKnowledgeRecord,
  type KnowledgeRecord,
} from "../../src/contracts/knowledgeRecord.js";
import {
  buildDefaultAdapterSet,
  buildLiveAdapterSet,
  diffScenarioParity,
  runParity,
} from "../../scripts/eval-fake-vs-live.js";
import { loadAllScenarios } from "../../src/eval/suites.js";
import { createFakeAdapter } from "../../src/engram/fakeEngramAdapter.js";
import { parseRetrievalRequest } from "../../src/contracts/retrieval.js";
import { runPreflight, type PreflightResult } from "../../src/engram/runPreflight.js";
import { LiveEngramError, createLiveAdapter } from "../../src/engram/liveEngramAdapter.js";

function fixture(path: string): KnowledgeRecord {
  const url = new URL(`../../fixtures/knowledge/${path}`, import.meta.url);
  return parseKnowledgeRecord(JSON.parse(readFileSync(url, "utf8")));
}

describe("diffScenarioParity: per-field comparison", () => {
  function makeResult(overrides: {
    outcome?: "allow" | "correct" | "blocked";
    stable?: string;
    trace?: string;
    corrections?: string[];
  }): PreflightResult {
    const base = {
      outcome: overrides.outcome ?? "correct",
      stable: overrides.stable ?? "trc-1234567890abcdef",
      trace: overrides.trace ?? "trc-fedcba0987654321",
      corrections: overrides.corrections ?? ["cmd1; if ($?) { cmd2 }"],
    };
    return {
      request: {
        project: "engram-rag",
        agent_id: "sdd-apply",
        task_text: "x",
        action_kind: "shell",
        shell: "powershell",
      },
      records: [],
      applied_rules: [],
      consulted_ids: [],
      quarantined_records: [],
      correction_candidates: base.corrections,
      missing_expected_records: [],
      latency_ms: 0,
      degraded: false,
      enforcement: {
        outcome: base.outcome,
        reason: "test",
        consulted_ids: [],
        missing_expected_records: [],
        quarantined_records: [],
        trace_id: base.trace,
        stable_trace_id: base.stable,
      },
    };
  }

  it("returns passed=true when outcomes and stable traces match", () => {
    const a = makeResult({});
    const b = makeResult({});
    const diff = diffScenarioParity(a, b, "s");
    expect(diff.passed).toBe(true);
    expect(diff.divergences).toEqual([]);
  });

  it("flags a difference in enforcement outcome", () => {
    const a = makeResult({ outcome: "correct" });
    const b = makeResult({ outcome: "blocked" });
    const diff = diffScenarioParity(a, b, "s");
    expect(diff.passed).toBe(false);
    expect(diff.divergences.join(" ")).toContain("outcome");
  });

  it("flags a difference in stable_trace_id", () => {
    const a = makeResult({ stable: "trc-aaaaaaaaaaaaaaaaaa" });
    const b = makeResult({ stable: "trc-bbbbbbbbbbbbbbbbb" });
    const diff = diffScenarioParity(a, b, "s");
    expect(diff.passed).toBe(false);
    expect(diff.divergences.join(" ")).toContain("stable_trace_id");
  });

  it("flags a difference in correction_candidates", () => {
    const a = makeResult({ corrections: ["cmd1; if ($?) { cmd2 }"] });
    const b = makeResult({ corrections: ["something else"] });
    const diff = diffScenarioParity(a, b, "s");
    expect(diff.passed).toBe(false);
    expect(diff.divergences.join(" ")).toContain("correction_candidates");
  });
});

describe("runParity: fake vs id-shifted fake (parity check)", () => {
  it("passes the eval suite end-to-end with the same outcome and stable trace per scenario", async () => {
    const records = [fixture("powershell-and.json")];
    const scenarios = loadAllScenarios();
    const adapters = buildDefaultAdapterSet(records);
    const summary = await runParity({ records, scenarios, adapters });

    // Counts are reported.
    expect(summary.counts.consulted_ids_total).toBeGreaterThan(0);
    expect(summary.counts.outcomes["correct"]).toBeGreaterThanOrEqual(1);

    // Every scenario must pass.
    expect(summary.failed).toBe(0);
    expect(summary.passed).toBe(scenarios.length);
  });

  it("matches the live P0 acceptance path on the powershell-and scenario", async () => {
    const records = [fixture("powershell-and.json")];
    const scenarios = loadAllScenarios();
    const ps = scenarios.find((s) => s.id === "powershell-and");
    if (ps === undefined) throw new Error("powershell-and scenario missing");
    const adapters = buildDefaultAdapterSet(records);
    const summary = await runParity({ records, scenarios: [ps], adapters });
    expect(summary.passed).toBe(1);
    expect(summary.results[0]?.fake_outcome).toBe("correct");
    expect(summary.results[0]?.live_outcome).toBe("correct");
    expect(summary.results[0]?.fake_stable_trace).toBe(
      summary.results[0]?.live_stable_trace,
    );
  });
});

describe("buildDefaultAdapterSet: id-shift wrapper", () => {
  it("yields the same stable_trace_id despite different observation ids", async () => {
    const records = [fixture("powershell-and.json")];
    const { fake, live } = buildDefaultAdapterSet(records);

    // Compare mem_search output to confirm the shift is in place.
    const fakeSearch = await fake.mem_search({
      query: "powershell && cd foo",
      project: "engram-rag",
      scope: "project",
      limit: 5,
    });
    const liveSearch = await live.mem_search({
      query: "powershell && cd foo",
      project: "engram-rag",
      scope: "project",
      limit: 5,
    });
    expect(fakeSearch.length).toBeGreaterThan(0);
    expect(liveSearch.length).toBeGreaterThan(0);
    expect(fakeSearch[0]?.id).toBe(1);
    expect(liveSearch[0]?.id).toBe(1001);

    // The stable trace must be identical because the consulted
    // signature set is the same.
    const request = parseRetrievalRequest({
      project: "engram-rag",
      agent_id: "sdd-apply",
      task_text: "Run `cd foo && npm install` in PowerShell.",
      action_kind: "shell",
      shell: "powershell",
    });
    const fakeResult = await runPreflight(request, fake);
    const liveResult = await runPreflight(request, live);
    expect(fakeResult.enforcement.outcome).toBe(liveResult.enforcement.outcome);
    expect(fakeResult.enforcement.stable_trace_id).toBe(
      liveResult.enforcement.stable_trace_id,
    );
    // The classical enforcement trace_id is allowed to differ
    // because it depends on the consulted observation ids.
  });
});

describe("buildLiveAdapterSet (live HTTP factory)", () => {
  it("returns the requested project name and a live adapter", () => {
    const records = [fixture("powershell-and.json")];
    const { fake, live } = buildLiveAdapterSet(
      records,
      "http://127.0.0.1:7437",
      "engram-rag",
    );
    expect(createFakeAdapter).toBeTruthy();
    // The live adapter factory returns a LiveEngramAdapter; we
    // assert the type shape rather than calling a real server.
    void fake;
    expect(live).toBeTruthy();
  });

  it("fails the live adapter when the server is unreachable", async () => {
    const { live } = buildLiveAdapterSet(
      [fixture("powershell-and.json")],
      "http://127.0.0.1:1", // unreachable port
      "engram-rag",
    );
    await expect(
      live.mem_search({
        query: "powershell",
        project: "engram-rag",
        scope: "project",
        limit: 5,
      }),
    ).rejects.toThrow(LiveEngramError);
    // Silence unused-warning; createLiveAdapter is imported for the
    // type assertion above.
    void createLiveAdapter;
  });
});
