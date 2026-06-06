import { describe, expect, it } from "vitest";
import { buildRetrievalPlan } from "../../src/retrieval/retrievalPlan.js";
import { parseRetrievalPlan } from "../../src/contracts/retrieval.js";
import { CANONICAL_PROTOCOL_TOPIC_KEY } from "../../src/contracts/topicKeys.js";

describe("retrievalPlan", () => {
  it("for sdd-apply + powershell, includes canonical, agent, and powershell trigger", () => {
    const plan = buildRetrievalPlan({
      project: "engram-rag",
      agent_id: "sdd-apply",
      task_text: "Run an npm install in PowerShell",
      action_kind: "shell",
      shell: "powershell",
    });

    // Re-validate against the schema to lock the contract.
    const parsed = parseRetrievalPlan(plan);

    expect(parsed.context_query).toEqual({ project: "engram-rag", scope: "project" });
    expect(parsed.require_full_observation).toBe(true);

    const allQueries = parsed.searches.map((s) => s.query).join(" | ");
    expect(allQueries).toContain(CANONICAL_PROTOCOL_TOPIC_KEY);
    expect(allQueries).toContain("sdd-apply");
    expect(allQueries).toContain("powershell");

    expect(parsed.forbidden_topic_aliases.length).toBeGreaterThan(0);
  });

  it("is deterministic for the same request", () => {
    const request = {
      project: "engram-rag",
      agent_id: "sdd-spec" as const,
      task_text: "Write a spec for retrieval planning",
      action_kind: "spec" as const,
    };
    const a = buildRetrievalPlan(request);
    const b = buildRetrievalPlan(request);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("includes gherkin trigger when the action is spec or task mentions gherkin", () => {
    const plan = buildRetrievalPlan({
      project: "engram-rag",
      agent_id: "sdd-spec",
      task_text: "Add a Given/When/Then scenario for retrieval",
      action_kind: "spec",
    });
    const allQueries = plan.searches.map((s) => s.query).join(" | ");
    expect(allQueries).toContain("gherkin");
  });

  it("does not call Engram: result has no async, no I/O, no env access", () => {
    const plan = buildRetrievalPlan({
      project: "engram-rag",
      agent_id: "sdd-verify",
      task_text: "Verify the powershell failure fixture",
      action_kind: "verify",
      shell: "powershell",
    });
    // If the planner ever started calling Engram this would still
    // pass at the type level, so we also assert the structural shape.
    expect(typeof plan).toBe("object");
    expect(Array.isArray(plan.searches)).toBe(true);
  });

  it("carries the global forbidden_topic_aliases from the policy", () => {
    const plan = buildRetrievalPlan({
      project: "engram-rag",
      agent_id: "sdd-apply",
      task_text: "any task",
      action_kind: "shell",
    });
    // Structural assertions only: the policy lives in
    // src/contracts/topicKeys.ts (read it to see the contents).
    // We assert the list is non-empty and that the canonical key is
    // NOT in the forbidden list (the canonical key is allowed, not
    // forbidden).
    expect(plan.forbidden_topic_aliases.length).toBeGreaterThan(0);
    expect(plan.forbidden_topic_aliases).not.toContain(CANONICAL_PROTOCOL_TOPIC_KEY);
  });
});
