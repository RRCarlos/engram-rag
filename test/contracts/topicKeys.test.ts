import { describe, expect, it } from "vitest";
import {
  CANONICAL_PROTOCOL_TOPIC_KEY,
  FORBIDDEN_TOPIC_ALIASES,
  assertNoForbiddenTopicAliases,
  buildFailureTopicKey,
  getCanonicalProtocolTopicKey,
} from "../../src/contracts/topicKeys.js";

describe("topicKeys", () => {
  it("exposes the canonical protocol key exactly once", () => {
    expect(CANONICAL_PROTOCOL_TOPIC_KEY).toBe("engram-rag/agent-rigor-protocol/v2");
    expect(getCanonicalProtocolTopicKey()).toBe(CANONICAL_PROTOCOL_TOPIC_KEY);
  });

  it("builds a derived failure key referencing the canonical key namespace", () => {
    const key = buildFailureTopicKey("sdd-apply", "powershell-and");
    expect(key).toBe("engram-rag/failures/sdd-apply/powershell-and");
    expect(key).toContain("engram-rag/failures/");
  });

  it("rejects empty parts in a failure key", () => {
    expect(() => buildFailureTopicKey("", "powershell-and")).toThrow();
    expect(() => buildFailureTopicKey("sdd-apply", "")).toThrow();
  });

  it.each(FORBIDDEN_TOPIC_ALIASES)(
    "throws when forbidden alias %s appears in input",
    (alias) => {
      expect(() => assertNoForbiddenTopicAliases(`topic: ${alias}`)).toThrow(
        /Forbidden v1 topic alias/,
      );
    },
  );

  it("accepts strings that do not contain any forbidden alias", () => {
    expect(() =>
      assertNoForbiddenTopicAliases(
        `canonical=${CANONICAL_PROTOCOL_TOPIC_KEY}, failure=engram-rag/failures/sdd-apply/powershell-and`,
      ),
    ).not.toThrow();
  });

  it("rejects non-string input with a TypeError", () => {
    expect(() =>
      assertNoForbiddenTopicAliases(undefined as unknown as string),
    ).toThrow(TypeError);
  });
});
