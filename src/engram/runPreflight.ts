import { performance } from "node:perf_hooks";
import type { KnowledgeRecord } from "../contracts/knowledgeRecord.js";
import type { RetrievalRequest } from "../contracts/retrieval.js";
import { buildRetrievalPlan } from "../retrieval/retrievalPlan.js";
import type { EngramTools, MemSearchResult } from "./EngramTools.js";

export interface PreflightResult {
  request: RetrievalRequest;
  records: KnowledgeRecord[];
  applied_rules: string[];
  missing_expected_records: string[];
  latency_ms: number;
  degraded: boolean;
}

function expectedTriggers(request: RetrievalRequest): string[] {
  const triggers = new Set<string>();
  if (request.shell === "powershell" || /powershell|pwsh/i.test(request.task_text)) {
    triggers.add("powershell");
  }
  if (request.action_kind === "spec" || /gherkin|given when then|scenario/i.test(request.task_text)) {
    triggers.add("gherkin");
  }
  return [...triggers];
}

function recordMatchesTrigger(record: KnowledgeRecord, trigger: string): boolean {
  const haystack = [
    record.failure_signature,
    record.validated_solution,
    ...record.trigger_terms,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(trigger.toLowerCase());
}

export async function runPreflight(
  request: RetrievalRequest,
  tools: EngramTools,
): Promise<PreflightResult> {
  const started = performance.now();
  const plan = buildRetrievalPlan(request);
  let degraded = false;
  const searchResults: MemSearchResult[] = [];
  const records: KnowledgeRecord[] = [];

  try {
    await tools.mem_context(plan.context_query);
  } catch {
    degraded = true;
  }

  for (const search of plan.searches) {
    try {
      searchResults.push(...(await tools.mem_search(search)));
    } catch {
      degraded = true;
    }
  }

  const ids = [...new Set(searchResults.map((result) => result.id))];
  for (const id of ids) {
    try {
      const observation = await tools.mem_get_observation({ id });
      records.push(observation.content);
    } catch {
      degraded = true;
    }
  }

  const appliedRules = [...new Set(records.map((record) => record.failure_signature))];
  const missingExpectedRecords = expectedTriggers(request).filter(
    (trigger) => !records.some((record) => recordMatchesTrigger(record, trigger)),
  );

  return {
    request,
    records,
    applied_rules: appliedRules,
    missing_expected_records: missingExpectedRecords,
    latency_ms: Math.max(0, performance.now() - started),
    degraded,
  };
}
