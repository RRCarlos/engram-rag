import {
  RetrievalPlan,
  RetrievalRequest,
  defaultForbiddenTopicAliases,
} from "../contracts/retrieval.js";
import { CANONICAL_PROTOCOL_TOPIC_KEY } from "../contracts/topicKeys.js";

/**
 * Build a deterministic retrieval plan for a request.
 *
 * The planner NEVER calls Engram. It is a pure function that maps a
 * RetrievalRequest into the list of searches an agent should perform
 * before acting. Phase 2 (Engram preflight adapter) executes this
 * plan against a real or fake adapter; Phase 1 only tests the shape.
 *
 * Design contract (from `rag-system/v2/design.md` §3, P1-08):
 * - For `sdd-apply` + PowerShell, the plan must search for the
 *   canonical protocol key, the agent id, and the `powershell`
 *   trigger term.
 * - The plan must declare `forbidden_topic_aliases` from the live
 *   topic policy.
 * - The plan must require full observations (no truncated context).
 */
export function buildRetrievalPlan(request: RetrievalRequest): RetrievalPlan {
  const project = request.project;
  const triggers = extractTriggers(request);

  const searches: RetrievalPlan["searches"] = [
    {
      query: `${CANONICAL_PROTOCOL_TOPIC_KEY} ${request.agent_id}`,
      project,
      scope: "project",
      limit: 5,
    },
    ...triggers.map((trigger) => ({
      query: `${request.agent_id} ${trigger}`,
      project,
      scope: "project" as const,
      limit: 5,
    })),
  ];

  return {
    context_query: { project, scope: "project" },
    searches,
    require_full_observation: true,
    forbidden_topic_aliases: defaultForbiddenTopicAliases(),
  };
}

/**
 * Pull the trigger terms relevant to the request. This is a small,
 * explicit list for Phase 1 — Phase 4 can swap in learned triggers
 * from evaluation runs. Keeping it explicit here means the test in
 * `test/retrieval/retrievalPlan.test.ts` can assert exact behaviour
 * without relying on tokenizer heuristics.
 */
function extractTriggers(request: RetrievalRequest): string[] {
  const triggers = new Set<string>();
  if (request.shell === "powershell") {
    triggers.add("powershell");
  } else if (request.shell === "bash") {
    triggers.add("bash");
  }
  if (request.action_kind === "spec") {
    triggers.add("gherkin");
  } else if (request.action_kind === "shell") {
    triggers.add("shell");
  } else if (request.action_kind === "verify") {
    triggers.add("verify");
  }
  if (/gherkin|given when then|scenario/i.test(request.task_text)) {
    triggers.add("gherkin");
  }
  if (/powershell|pwsh/i.test(request.task_text)) {
    triggers.add("powershell");
  }
  // Always include the agent's own failure namespace so the planner
  // also covers per-failure records.
  triggers.add("failures");
  return [...triggers];
}
