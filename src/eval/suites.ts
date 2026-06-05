/**
 * Phase 4 — load and validate scenarios.
 *
 * Reads every `*.json` under `eval/scenarios/` (relative to the
 * repo root), parses each against the Zod schema, and returns
 * the array. Exits the process with a useful error message if a
 * scenario file is missing required fields or carries a
 * forbidden v1 topic alias.
 *
 * The loader is the only place that knows the on-disk layout
 * for the scenario suite. Tests assert the loader's behavior;
 * the runner and the CLI both consume its output.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { EvalScenarioSchema, type EvalScenario } from "./types.js";
import { FORBIDDEN_TOPIC_ALIASES } from "../contracts/topicKeys.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const SCENARIOS_DIR = resolve(__dirname, "..", "..", "eval", "scenarios");

/**
 * Validate that a parsed scenario does not reference any
 * forbidden v1 topic alias in its expected record set. A
 * scenario that *expects* a v1 alias would be a regression in
 * itself; the guardrail fails fast at load time.
 */
function assertNoForbiddenAliases(scenario: EvalScenario): void {
  const haystack = [
    scenario.id,
    scenario.description,
    scenario.task_text,
    ...scenario.expected_record_topic_keys,
    ...scenario.expected_applied_rules,
  ].join("\n");
  for (const alias of FORBIDDEN_TOPIC_ALIASES) {
    if (haystack.includes(alias)) {
      throw new Error(
        `Scenario "${scenario.id}" references forbidden v1 topic alias "${alias}". ` +
          `Update the scenario to use the canonical v2 topic key.`,
      );
    }
  }
}

/**
 * Load and parse a single scenario file.
 */
export function loadScenarioFile(path: string): EvalScenario {
  const raw = readFileSync(path, "utf8");
  const parsed = EvalScenarioSchema.parse(JSON.parse(raw));
  assertNoForbiddenAliases(parsed);
  return parsed;
}

/**
 * Load every `*.json` scenario under `SCENARIOS_DIR`, sorted by
 * filename for deterministic ordering. Throws on the first
 * invalid file (a typo or missing field is a developer error
 * and should fail the suite).
 */
export function loadAllScenarios(): EvalScenario[] {
  if (!statSync(SCENARIOS_DIR, { throwIfNoEntry: false })) {
    return [];
  }
  const files = readdirSync(SCENARIOS_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort();
  return files.map((name) => loadScenarioFile(resolve(SCENARIOS_DIR, name)));
}
