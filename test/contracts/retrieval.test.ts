import { describe, expect, it } from "vitest";
import {
  ACTION_KINDS,
  RetrievalPlanSchema,
  RetrievalRequestSchema,
  SHELL_KINDS,
  defaultForbiddenTopicAliases,
  parseRetrievalPlan,
  parseRetrievalRequest,
} from "../../src/contracts/retrieval.js";
import { AGENT_IDS } from "../../src/contracts/knowledgeRecord.js";
import { CANONICAL_PROTOCOL_TOPIC_KEY } from "../../src/contracts/topicKeys.js";

const baseRequest = {
  project: "engram-rag",
  agent_id: "sdd-apply" as const,
  task_text: "Run a shell command in PowerShell",
  action_kind: "shell" as const,
};

describe("retrieval contract", () => {
  it("accepts a fully valid request", () => {
    const r = parseRetrievalRequest(baseRequest);
    expect(r.agent_id).toBe("sdd-apply");
  });

  it("rejects an unknown action_kind", () => {
    const result = RetrievalRequestSchema.safeParse({
      ...baseRequest,
      action_kind: "magic",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown agent_id", () => {
    const result = RetrievalRequestSchema.safeParse({
      ...baseRequest,
      agent_id: "not-an-agent",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty task_text", () => {
    const result = RetrievalRequestSchema.safeParse({
      ...baseRequest,
      task_text: "",
    });
    expect(result.success).toBe(false);
  });

  it.each(ACTION_KINDS)("accepts action_kind %s", (kind) => {
    const result = RetrievalRequestSchema.safeParse({
      ...baseRequest,
      action_kind: kind,
    });
    expect(result.success).toBe(true);
  });

  it.each(SHELL_KINDS)("accepts shell %s when provided", (kind) => {
    const result = RetrievalRequestSchema.safeParse({
      ...baseRequest,
      shell: kind,
    });
    expect(result.success).toBe(true);
  });

  it.each(AGENT_IDS)("accepts agent_id %s", (id) => {
    const result = RetrievalRequestSchema.safeParse({
      ...baseRequest,
      agent_id: id,
    });
    expect(result.success).toBe(true);
  });

  it("defaultForbiddenTopicAliases includes canonical and all v1 aliases", () => {
    const aliases = defaultForbiddenTopicAliases();
    expect(aliases).toContain(CANONICAL_PROTOCOL_TOPIC_KEY);
    expect(aliases.length).toBeGreaterThan(0);
    // The canonical key must not be marked as forbidden in the policy
    // list itself — the planner uses this for *context* queries.
  });

  it("parses a minimal RetrievalPlan", () => {
    const plan = {
      context_query: { project: "engram-rag", scope: "project" as const },
      searches: [
        { query: "powershell &&", project: "engram-rag", scope: "project" as const, limit: 5 },
      ],
      require_full_observation: true,
      forbidden_topic_aliases: defaultForbiddenTopicAliases(),
    };
    const parsed = parseRetrievalPlan(plan);
    expect(parsed.searches[0]?.limit).toBe(5);
  });

  it("rejects a plan with no searches", () => {
    const result = RetrievalPlanSchema.safeParse({
      context_query: { project: "engram-rag", scope: "project" },
      searches: [],
      require_full_observation: true,
      forbidden_topic_aliases: defaultForbiddenTopicAliases(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a search with a non-positive limit", () => {
    const result = RetrievalPlanSchema.safeParse({
      context_query: { project: "engram-rag", scope: "project" },
      searches: [
        { query: "powershell &&", project: "engram-rag", scope: "project", limit: 0 },
      ],
      require_full_observation: true,
      forbidden_topic_aliases: defaultForbiddenTopicAliases(),
    });
    expect(result.success).toBe(false);
  });
});
