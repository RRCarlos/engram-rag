import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { safeParseRagRetrievalResponse } from "../../src/contracts/rag.js";
import { chunkDocuments } from "../../src/rag/chunker.js";
import { loadCorpusDocuments } from "../../src/rag/corpusLoader.js";
import { retrieveChunks } from "../../src/rag/retriever.js";

const REPO_ROOT = resolve(__dirname, "..", "..");

function runRagQuery(args: string[]): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execFileSync("node", ["--import", "tsx", "src/cli/ragQuery.ts", ...args], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120_000,
    });
    return { stdout, stderr: "", status: 0 };
  } catch (error) {
    const err = error as { status?: number; stdout?: string; stderr?: string };
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      status: err.status ?? 1,
    };
  }
}

describe("ragQuery CLI", () => {
  it("prints citation-ready JSON equivalent to the API boundary", async () => {
    const documents = await loadCorpusDocuments();
    const expected = retrieveChunks(
      { text: "stable citations", top_k: 2 },
      chunkDocuments(documents),
    );

    const result = runRagQuery(["--query", "stable citations", "--top-k", "2"]);
    const json = JSON.parse(result.stdout) as unknown;
    const parsed = safeParseRagRetrievalResponse(json);

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(JSON.stringify(json));
    expect(parsed.ok).toBe(true);
    expect(json).toEqual(expected);
  });

  it("honors a custom corpus directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "rag-query-corpus-"));
    try {
      await writeFile(
        join(dir, "custom.json"),
        JSON.stringify({
          id: "doc-custom",
          title: "Custom CLI Corpus",
          source_path: "custom.json",
          text: "Custom command line retrieval proves corpus directory support.",
        }),
      );

      const result = runRagQuery([
        "--query",
        "command line retrieval",
        "--top-k",
        "1",
        "--corpus-dir",
        dir,
      ]);
      const response = JSON.parse(result.stdout) as { results: Array<{ citation: { document_id: string } }> };

      expect(result.status).toBe(0);
      expect(response.results).toHaveLength(1);
      expect(response.results[0]?.citation.document_id).toBe("doc-custom");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("writes validation errors to stderr without emitting retrieval JSON", () => {
    const result = runRagQuery(["--query", "", "--top-k", "0"]);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/query/i);
    expect(result.stderr).toMatch(/top-k|top_k/i);
  });
});
