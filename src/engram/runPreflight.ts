import { performance } from "node:perf_hooks";
import type { KnowledgeRecord } from "../contracts/knowledgeRecord.js";
import type { RetrievalRequest } from "../contracts/retrieval.js";
import { buildRetrievalPlan } from "../retrieval/retrievalPlan.js";
import {
  evaluateEnforcement,
  type PreflightEnforcement,
} from "./enforcement.js";
import type {
  EngramQuarantineReporter,
  EngramTools,
  MemSearchResult,
  QuarantinedRecord,
} from "./EngramTools.js";

export interface PreflightResult {
  request: RetrievalRequest;
  records: KnowledgeRecord[];
  applied_rules: string[];
  consulted_ids: number[];
  quarantined_records: QuarantinedRecord[];
  correction_candidates: string[];
  missing_expected_records: string[];
  latency_ms: number;
  degraded: boolean;
  enforcement: PreflightEnforcement;
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

function hasQuarantineReporter(tools: EngramTools): tools is EngramTools & EngramQuarantineReporter {
  return typeof (tools as Partial<EngramQuarantineReporter>).getQuarantinedRecords === "function";
}

function reasonFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function observationIdFromError(error: unknown): number | undefined {
  const maybe = error as { observationId?: unknown };
  return typeof maybe.observationId === "number" ? maybe.observationId : undefined;
}

function mergeQuarantine(records: QuarantinedRecord[], record: QuarantinedRecord): void {
  if (!records.some((existing) => existing.id === record.id && existing.source === record.source)) {
    records.push(record);
  }
}

function extractCorrectionCandidates(records: KnowledgeRecord[]): string[] {
  const candidates = new Set<string>();
  for (const record of records) {
    const matches = record.validated_solution.match(/`([^`]*;\s*if \(\$\?\) \{[^`]+\})`/g) ?? [];
    for (const match of matches) {
      const candidate = match.slice(1, -1);
      candidates.add(candidate);
      if (/;\s*if \(\$\?\) \{/.test(candidate)) {
        candidates.add("cmd1; if ($?) { cmd2 }");
      }
    }
  }
  return [...candidates];
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
  const quarantinedRecords: QuarantinedRecord[] = [];

  try {
    await tools.mem_context(plan.context_query);
  } catch {
    degraded = true;
  }

  for (const search of plan.searches) {
    try {
      searchResults.push(...(await tools.mem_search(search)));
      if (hasQuarantineReporter(tools)) {
        for (const record of tools.getQuarantinedRecords()) {
          mergeQuarantine(quarantinedRecords, record);
        }
      }
    } catch {
      degraded = true;
    }
  }

  const quarantinedIds = new Set(quarantinedRecords.map((record) => record.id));
  const ids = [...new Set(searchResults.map((result) => result.id))].filter(
    (id) => !quarantinedIds.has(id),
  );
  const consultedIds: number[] = [];
  for (const id of ids) {
    try {
      const observation = await tools.mem_get_observation({ id });
      records.push(observation.content);
      consultedIds.push(id);
    } catch (error) {
      const observationId = observationIdFromError(error);
      if (observationId !== undefined) {
        mergeQuarantine(quarantinedRecords, {
          id: observationId,
          reason: reasonFromError(error),
          source: "get",
        });
      } else {
        degraded = true;
      }
    }
  }

  const appliedRules = [...new Set(records.map((record) => record.failure_signature))];
  const missingExpectedRecords = expectedTriggers(request).filter(
    (trigger) => !records.some((record) => recordMatchesTrigger(record, trigger)),
  );

  const base: Omit<PreflightResult, "enforcement"> = {
    request,
    records,
    applied_rules: appliedRules,
    consulted_ids: consultedIds,
    quarantined_records: quarantinedRecords,
    correction_candidates: extractCorrectionCandidates(records),
    missing_expected_records: missingExpectedRecords,
    latency_ms: Math.max(0, performance.now() - started),
    degraded,
  };
  return { ...base, enforcement: evaluateEnforcement({ request, result: base }) };
}
