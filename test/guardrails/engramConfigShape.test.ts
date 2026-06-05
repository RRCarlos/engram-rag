import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Guardrail: `.engram/config.json` must carry BOTH `project` and
 * `project_name` keys.
 *
 * The Engram MCP server requires `project_name` as its primary
 * project identifier. However, when the cwd contains multiple git
 * repos, the Engram server also reads the `project` key to
 * auto-detect which repo the cwd belongs to. If either key is
 * missing or the two values disagree, every Engram call fails with
 * `ambiguous_project` or `project_name is required`.
 *
 * This regression was hit on 2026-06-05 after PR #2 renamed
 * `project` -> `project_name` and never added `project` back. This
 * test makes the rule explicit and CI-enforced so a future
 * "cleanup" cannot silently break Engram integration again.
 */

const REPO_ROOT = resolve(__dirname, "..", "..");
const CONFIG_PATH = resolve(REPO_ROOT, ".engram", "config.json");

type EngramConfig = {
  project?: unknown;
  project_name?: unknown;
  path?: unknown;
};

function loadConfig(): EngramConfig {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(
      `.engram/config.json not found at ${CONFIG_PATH}. ` +
        "Restore it with both `project` and `project_name` keys.",
    );
  }
  const raw = readFileSync(CONFIG_PATH, "utf8");
  try {
    return JSON.parse(raw) as EngramConfig;
  } catch (err) {
    throw new Error(
      `.engram/config.json is not valid JSON: ${(err as Error).message}`,
    );
  }
}

describe("engramConfigShape", () => {
  it("exists at .engram/config.json", () => {
    expect(existsSync(CONFIG_PATH)).toBe(true);
  });

  it("has the `project` key (multi-repo auto-detect)", () => {
    const config = loadConfig();
    expect(typeof config.project).toBe("string");
    expect((config.project as string).length).toBeGreaterThan(0);
  });

  it("has the `project_name` key (Engram MCP requirement)", () => {
    const config = loadConfig();
    expect(typeof config.project_name).toBe("string");
    expect((config.project_name as string).length).toBeGreaterThan(0);
  });

  it("`project` and `project_name` agree", () => {
    const config = loadConfig();
    expect(config.project).toBe(config.project_name);
  });

  it("`path` matches the actual repo root", () => {
    const config = loadConfig();
    const normalize = (s: string) => s.split("\\").join("/");
    const actual = normalize(String(config.path ?? ""));
    const want = normalize(REPO_ROOT);
    expect(actual).toBe(want);
  });
});
