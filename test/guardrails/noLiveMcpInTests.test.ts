import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

/**
 * Guardrail: Phase 2's fake adapter is the only adapter allowed in
 * CI. Live MCP integration is explicitly out of scope for Phase 2
 * and must not leak into `src/` or `test/`, otherwise CI becomes
 * environment-dependent and repeats the v1 "works locally" failure.
 */

const REPO_ROOT = resolve(__dirname, "..", "..");

const SCAN_ROOTS = ["src", "test"];
const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);

const ALLOWED_EXCEPTIONS = new Set<string>([
  // This test names the forbidden patterns so the detector can prove
  // it is not vacuous. No production/test helper should be added here
  // without a written justification in the task file.
  "test/guardrails/noLiveMcpInTests.test.ts",
  // The MCP server is the legitimate integration point for the engram-rag
  // MCP server; it requires the real SDK to function.
  "src/mcp/ragServer.ts",
]);

const FORBIDDEN_PATTERNS: RegExp[] = [
  /from\s+["']@modelcontextprotocol\//,
  /import\s*\([^)]*["']@modelcontextprotocol\//,
  /require\s*\([^)]*["']@modelcontextprotocol\//,
  /engram-mcp/i,
  /[A-Z]:\\[^"'`\n]*(?:\\mcp\\|modelcontextprotocol)[^"'`\n]*/i,
  /\/(?:home|Users|usr|opt|var|tmp)\/[^"'`\n]*(?:\/mcp\/|modelcontextprotocol)[^"'`\n]*/i,
];

function listFiles(root: string): string[] {
  const absolute = resolve(REPO_ROOT, root);
  if (!existsSync(absolute)) {
    return [];
  }
  const out: string[] = [];
  const stack: string[] = [absolute];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    const stat = statSync(current);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(current)) {
        if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) {
          continue;
        }
        stack.push(join(current, entry));
      }
    } else if (stat.isFile() && SCAN_EXTENSIONS.has(extname(current))) {
      out.push(relative(REPO_ROOT, current).split("\\").join("/"));
    }
  }
  return out;
}

function detectForbiddenLiveMcp(content: string): string[] {
  return FORBIDDEN_PATTERNS.flatMap((pattern) => {
    const match = content.match(pattern);
    return match === null ? [] : [match[0]];
  });
}

describe("noLiveMcpInTests", () => {
  const files = SCAN_ROOTS.flatMap((root) => listFiles(root));

  it("scans at least one active source or test file", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("file %s contains no live MCP import or binary path", (relPath) => {
    if (ALLOWED_EXCEPTIONS.has(relPath)) {
      return;
    }
    const content = readFileSync(resolve(REPO_ROOT, relPath), "utf8");
    const matches = detectForbiddenLiveMcp(content);
    if (matches.length > 0) {
      throw new Error(
        `Live MCP reference found in ${relPath}: ${matches.join(", ")}. ` +
          "Use the fake Engram adapter in CI; live MCP belongs in an explicit local smoke path.",
      );
    }
    expect(true).toBe(true);
  });

  it("detects representative forbidden live MCP references", () => {
    const samples = [
      "import { Client } from '@modelcontextprotocol/sdk/client/index.js';",
      "const sdk = require('@modelcontextprotocol/sdk');",
      "const mod = await import('@modelcontextprotocol/sdk');",
      "const server = 'engram-mcp';",
      "const win = 'C:\\Users\\PC\\.config\\opencode\\mcp\\engram.exe';",
      "const unix = '/home/me/.config/opencode/mcp/engram';",
    ];

    for (const sample of samples) {
      expect(detectForbiddenLiveMcp(sample).length).toBeGreaterThan(0);
    }
  });
});
