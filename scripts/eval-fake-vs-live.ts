/**
 * eval-fake-vs-live — PR4 / #30 fake/live eval parity check.
 *
 * Runs the same scenario set against the fake adapter and against a
 * mock live adapter, then diffs:
 *
 *   - `enforcement.outcome`        (allow | correct | blocked)
 *   - `enforcement.stable_trace_id` (PR4 stable trace)
 *   - `enforcement.trace_id`        (enforcement trace; expected to
 *                                   differ when observation ids
 *                                   differ between the two adapters)
 *
 * The two adapters MUST agree on outcome and stable trace for the
 * same scenario. The classical `trace_id` is allowed to differ
 * because it is bound to the exact observation ids consulted.
 *
 * Run modes:
 *
 *   - **Default (no `--live-base-url`)**: both adapters are local
 *     fake / mock-live fakes seeded with the same `KnowledgeRecord`
 *     content but different observation ids. This is the CI-safe
 *     parity check.
 *   - **`--live-base-url <url>`**: the second adapter uses the real
 *     live HTTP adapter against a running Engram instance. The
 *     parity check now compares fake (with id set 1..N) against
 *     live (with whatever ids the server returned).
 *
 * Exit codes:
 *
 *   - 0  every scenario matches
 *   - 1  invalid flags
 *   - 2  one or more scenarios diverged
 *   - 3  adapter or I/O error
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { loadAllScenarios, SCENARIOS_DIR } from "../src/eval/suites.js";
import type { EvalScenario } from "../src/eval/types.js";
import type { EngramTools } from "../src/engram/EngramTools.js";
import { createFakeAdapter } from "../src/engram/fakeEngramAdapter.js";
import { createLiveAdapter } from "../src/engram/liveEngramAdapter.js";
import { runPreflight, type PreflightResult } from "../src/engram/runPreflight.js";
import { parseRetrievalRequest } from "../src/contracts/retrieval.js";
import { parseKnowledgeRecord, type KnowledgeRecord } from "../src/contracts/knowledgeRecord.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");

export interface ParityAdapterSet {
  fake: EngramTools;
  live: EngramTools;
}

/**
 * Build the default adapter set: a fake and a "live-mock" fake that
 * both share the same `KnowledgeRecord` content but expose different
 * observation ids. The two adapters are constructed by the same
 * `createFakeAdapter` factory; the id shift is achieved by prefixing
 * the input array with the desired id offset.
 *
 * The fake adapter always assigns ids 1..N based on array order. To
 * produce a different id range without writing a second factory, we
 * shift the records by inserting a known offset and then asking
 * the live adapter to re-parse the records through the
 * `parseEngramContentToRecord` pipeline. The simpler approach: wrap
 * each fake adapter's `mem_search` to remap ids 1..N to 1000..N.
 */
export function buildDefaultAdapterSet(
  records: KnowledgeRecord[],
): ParityAdapterSet {
  const fake = createFakeAdapter(records);
  const live = createFakeAdapter(records, undefined);
  return { fake, live: withIdShift(live, 1000) };
}

function withIdShift(tools: EngramTools, offset: number): EngramTools {
  return {
    async mem_context(input) {
      return tools.mem_context(input);
    },
    async mem_search(input) {
      const results = await tools.mem_search(input);
      return results.map((result) => ({ ...result, id: result.id + offset }));
    },
    async mem_get_observation(input) {
      // The fake adapter assigns ids 1..N; we cannot fetch a record
      // with an id outside that range, so we map shifted ids back
      // to the original range for the get, then shift the result
      // back on the way out.
      const id = input.id - offset;
      const observation = await tools.mem_get_observation({ id });
      return { ...observation, id: input.id };
    },
    async mem_save(input) {
      const result = await tools.mem_save(input);
      return { ...result, id: result.id + offset };
    },
  };
}

/**
 * Build an adapter set where the second adapter is a real live
 * adapter pointed at the given Engram base URL. The first adapter
 * remains the local fake. The caller is responsible for ensuring
 * the live Engram has the same knowledge as the fake.
 */
export function buildLiveAdapterSet(
  records: KnowledgeRecord[],
  liveBaseUrl: string,
  project: string,
): ParityAdapterSet {
  return {
    fake: createFakeAdapter(records),
    live: createLiveAdapter({ baseUrl: liveBaseUrl, project, scope: "project" }),
  };
}

export interface ScenarioParityResult {
  scenario_id: string;
  passed: boolean;
  fake_outcome: string;
  live_outcome: string;
  fake_stable_trace: string;
  live_stable_trace: string;
  fake_trace: string;
  live_trace: string;
  divergences: string[];
}

export function diffScenarioParity(
  fakeResult: PreflightResult,
  liveResult: PreflightResult,
  scenarioId: string,
): ScenarioParityResult {
  const divergences: string[] = [];
  if (fakeResult.enforcement.outcome !== liveResult.enforcement.outcome) {
    divergences.push(
      `outcome: fake=${fakeResult.enforcement.outcome}, live=${liveResult.enforcement.outcome}`,
    );
  }
  if (fakeResult.enforcement.stable_trace_id !== liveResult.enforcement.stable_trace_id) {
    divergences.push(
      `stable_trace_id: fake=${fakeResult.enforcement.stable_trace_id}, live=${liveResult.enforcement.stable_trace_id}`,
    );
  }
  if (fakeResult.correction_candidates.join("|") !== liveResult.correction_candidates.join("|")) {
    divergences.push("correction_candidates differ");
  }
  return {
    scenario_id: scenarioId,
    passed: divergences.length === 0,
    fake_outcome: fakeResult.enforcement.outcome,
    live_outcome: liveResult.enforcement.outcome,
    fake_stable_trace: fakeResult.enforcement.stable_trace_id,
    live_stable_trace: liveResult.enforcement.stable_trace_id,
    fake_trace: fakeResult.enforcement.trace_id,
    live_trace: liveResult.enforcement.trace_id,
    divergences,
  };
}

export interface RunParityOptions {
  records: KnowledgeRecord[];
  scenarios: EvalScenario[];
  adapters: ParityAdapterSet;
}

export interface RunParityResult {
  total: number;
  passed: number;
  failed: number;
  results: ScenarioParityResult[];
  counts: {
    consulted_ids_total: number;
    quarantined_total: number;
    degraded_total: number;
    missing_total: number;
    outcomes: Record<string, number>;
  };
}

export async function runParity(options: RunParityOptions): Promise<RunParityResult> {
  const { records, scenarios, adapters } = options;
  const counts = {
    consulted_ids_total: 0,
    quarantined_total: 0,
    degraded_total: 0,
    missing_total: 0,
    outcomes: { allow: 0, correct: 0, blocked: 0 } as Record<string, number>,
  };
  const results: ScenarioParityResult[] = [];
  let passed = 0;
  for (const scenario of scenarios) {
    const request = parseRetrievalRequest({
      project: scenario.project,
      agent_id: scenario.agent_id,
      task_text: scenario.task_text,
      action_kind: scenario.action_kind,
      shell: scenario.shell,
    });
    const [fakeResult, liveResult] = await Promise.all([
      runPreflight(request, adapters.fake),
      runPreflight(request, adapters.live),
    ]);
    counts.consulted_ids_total +=
      fakeResult.consulted_ids.length + liveResult.consulted_ids.length;
    counts.quarantined_total +=
      fakeResult.quarantined_records.length + liveResult.quarantined_records.length;
    counts.degraded_total +=
      (fakeResult.degraded ? 1 : 0) + (liveResult.degraded ? 1 : 0);
    counts.missing_total +=
      fakeResult.missing_expected_records.length +
      liveResult.missing_expected_records.length;
    const outcome = fakeResult.enforcement.outcome;
    counts.outcomes[outcome] = (counts.outcomes[outcome] ?? 0) + 1;
    const diff = diffScenarioParity(fakeResult, liveResult, scenario.id);
    results.push(diff);
    if (diff.passed) passed += 1;
    // Suppress the unused-records linter complaint when records is
    // empty; the caller is expected to have seeded the fake with
    // knowledge, but the parity logic itself does not need records.
    void records;
  }
  return {
    total: scenarios.length,
    passed,
    failed: scenarios.length - passed,
    results,
    counts,
  };
}

interface CliArgs {
  liveBaseUrl?: string;
  project: string;
  json: boolean;
}

function parseCliArgs(argv: string[]): CliArgs {
  const values = new Map<string, string>();
  let json = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (!arg.startsWith("--")) throw new Error(`Unexpected positional argument: ${arg}`);
    const key = arg.slice(2);
    if (!["live-base-url", "project"].includes(key)) {
      throw new Error(`Unknown flag: ${arg}`);
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${arg}`);
    }
    values.set(key, value);
    i += 1;
  }
  const project = values.get("project") ?? "engram-rag";
  const result: CliArgs = { project, json };
  const live = values.get("live-base-url");
  if (live !== undefined) result.liveBaseUrl = live;
  return result;
}

function loadKnowledgeFixtures(): KnowledgeRecord[] {
  const dir = resolve(REPO_ROOT, "fixtures", "knowledge");
  const files = readdirSync(dir).filter((name) => name.endsWith(".json")).sort();
  return files.map((file) => parseKnowledgeRecord(JSON.parse(readFileSync(resolve(dir, file), "utf8"))));
}

async function main(): Promise<number> {
  let args: CliArgs;
  try {
    args = parseCliArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    return 1;
  }
  const scenarios = loadAllScenarios();
  if (scenarios.length === 0) {
    process.stderr.write(`No scenarios found in ${SCENARIOS_DIR}\n`);
    return 1;
  }
  const records = loadKnowledgeFixtures();
  const adapters =
    args.liveBaseUrl !== undefined
      ? buildLiveAdapterSet(records, args.liveBaseUrl, args.project)
      : buildDefaultAdapterSet(records);
  let summary: RunParityResult;
  try {
    summary = await runParity({ records, scenarios, adapters });
  } catch (error) {
    process.stderr.write(`parity run failed: ${(error as Error).message}\n`);
    return 3;
  }
  if (args.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    process.stdout.write(
      [
        `Scenarios: ${summary.total} (passed ${summary.passed}, failed ${summary.failed})`,
        `Counts: consulted_ids=${summary.counts.consulted_ids_total}, ` +
          `quarantined=${summary.counts.quarantined_total}, ` +
          `degraded=${summary.counts.degraded_total}, ` +
          `missing=${summary.counts.missing_total}, ` +
          `outcomes=${JSON.stringify(summary.counts.outcomes)}`,
        ...summary.results.map(
          (r) =>
            `  [${r.passed ? "PASS" : "FAIL"}] ${r.scenario_id} ` +
            `outcome=${r.fake_outcome}/${r.live_outcome} ` +
            `stable=${r.fake_stable_trace.slice(0, 12)}/${r.live_stable_trace.slice(0, 12)}` +
            (r.divergences.length > 0 ? `  (${r.divergences.join("; ")})` : ""),
        ),
      ].join("\n") + "\n",
    );
  }
  return summary.failed === 0 ? 0 : 2;
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));

if (invokedDirectly) {
  main().then(
    (exit) => process.exit(exit),
    (error) => {
      process.stderr.write(`${(error as Error).message}\n`);
      process.exit(3);
    },
  );
}
