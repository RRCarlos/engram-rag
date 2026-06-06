import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  type DocumentChunk,
  type RetrievalMode,
  type RagRetrievalResult,
} from "../contracts/rag.js";
import type { Embedder } from "./embedder/embedder.js";
import type { GraphIndex } from "./graphIndex/store.js";
import { retrieveHybrid } from "./hybridRetriever.js";
import { retrieveChunks } from "./retriever.js";
import { type VectorIndexEntry } from "./vectorIndex/store.js";

export type RagEvalScenario = {
  id: string;
  query: string;
  top_k: number;
  expected_chunk_ids: string[];
  /**
   * Retrieval mode used to drive the scenario. Defaults to `"lexical"` for
   * backward compatibility with the archived kag-rag-functional slice.
   */
  mode?: RetrievalMode;
};

export type RagEvalCitation = {
  chunk_id: string;
  document_id: string;
  source_path: string;
};

export type RagEvalScenarioScore = {
  chunk_id: string;
  top_level_score: number;
  /**
   * RRF-fused score for this chunk when the scenario was run in a mode
   * that emits a `signals.fused` block (`hybrid`). `null` for lexical
   * scenarios so the test can assert non-hybrid baseline behavior.
   */
  fused_score: number | null;
};

export type RagEvalResult = {
  id: string;
  status: "PASS" | "FAIL";
  matched_chunk_ids: string[];
  missing_chunk_ids: string[];
  citations: RagEvalCitation[];
  /**
   * The mode that drove the scenario. Defaults to `"lexical"` for the
   * archived baseline scenarios.
   */
  mode: RetrievalMode;
  /**
   * Per-result scores keyed by chunk id. For non-lexical modes the
   * `fused_score` MUST match the top-level `score` on the underlying
   * `RagRetrievalResult`, per the spec scenario "Fuse three signals with
   * RRF".
   */
  scores: RagEvalScenarioScore[];
};

export type RagEvalReport = {
  scenarios_total: number;
  scenarios_passed: number;
  results: RagEvalResult[];
};

/**
 * Options required when running non-lexical eval scenarios. Lexical
 * scenarios ignore all of these fields and match the archived
 * `kag-rag-functional` baseline.
 */
export type RagEvalOptions = {
  embedder?: Embedder;
  prebuiltEntries?: VectorIndexEntry[];
  prebuiltGraph?: GraphIndex;
  graphDictionary?: readonly string[];
  corpusHash?: string;
  defaultMode?: RetrievalMode;
};

export function evaluateRagScenarios(
  scenarios: RagEvalScenario[],
  chunks: DocumentChunk[],
  options: RagEvalOptions = {},
): RagEvalReport {
  const results = scenarios.map((scenario) => evaluateScenario(scenario, chunks, options));

  return {
    scenarios_total: results.length,
    scenarios_passed: results.filter((result) => result.status === "PASS").length,
    results,
  };
}

function evaluateScenario(
  scenario: RagEvalScenario,
  chunks: DocumentChunk[],
  options: RagEvalOptions,
): RagEvalResult {
  const mode: RetrievalMode = scenario.mode ?? options.defaultMode ?? "lexical";
  const response = runScenario(scenario, chunks, options, mode);
  const returnedChunkIds = response.results.map((result) => result.chunk_id);
  const matchedChunkIds = scenario.expected_chunk_ids.filter((chunkId) =>
    returnedChunkIds.includes(chunkId),
  );
  const missingChunkIds = scenario.expected_chunk_ids.filter((chunkId) =>
    !returnedChunkIds.includes(chunkId),
  );
  const citationResults = matchedChunkIds.length > 0
    ? response.results.filter((result) => matchedChunkIds.includes(result.chunk_id))
    : response.results;

  return {
    id: scenario.id,
    status: missingChunkIds.length === 0 ? "PASS" : "FAIL",
    matched_chunk_ids: matchedChunkIds,
    missing_chunk_ids: missingChunkIds,
    mode,
    citations: citationResults.map((result) => ({
      chunk_id: result.chunk_id,
      document_id: result.citation.document_id,
      source_path: result.citation.source_path,
    })),
    scores: response.results.map((result) => ({
      chunk_id: result.chunk_id,
      top_level_score: result.score,
      fused_score: extractFusedScore(result),
    })),
  };
}

function runScenario(
  scenario: RagEvalScenario,
  chunks: DocumentChunk[],
  options: RagEvalOptions,
  mode: RetrievalMode,
): { results: RagRetrievalResult[] } {
  if (mode === "lexical") {
    return retrieveChunks({ text: scenario.query, top_k: scenario.top_k }, chunks);
  }
  const embedder = options.embedder;
  if (!embedder) {
    throw new Error(
      `ragEval: scenario '${scenario.id}' uses mode '${mode}' but no embedder was provided; pass RagEvalOptions.embedder`,
    );
  }
  return retrieveHybrid(
    { text: scenario.query, top_k: scenario.top_k },
    chunks,
    {
      embedder,
      mode,
      ...(options.prebuiltEntries !== undefined ? { prebuiltEntries: options.prebuiltEntries } : {}),
      ...(options.prebuiltGraph !== undefined ? { prebuiltGraph: options.prebuiltGraph } : {}),
      ...(options.graphDictionary !== undefined ? { graphDictionary: options.graphDictionary } : {}),
      ...(options.corpusHash !== undefined ? { corpusHash: options.corpusHash } : {}),
    },
  );
}

function extractFusedScore(result: RagRetrievalResult): number | null {
  const fused = result.signals?.fused;
  if (!fused) {
    return null;
  }
  const self = fused.find((entry) => entry.chunk_id === result.chunk_id);
  return self ? self.score : null;
}

/**
 * Load eval scenarios from a JSON file on disk. The file MUST be a
 * top-level array of `RagEvalScenario` objects. Relative paths are
 * resolved against the current working directory.
 */
export async function loadRagEvalScenarios(path: string): Promise<RagEvalScenario[]> {
  const absolute = resolve(path);
  const raw = await readFile(absolute, "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`ragEval: scenarios file '${absolute}' must be a top-level array`);
  }
  for (const [index, entry] of parsed.entries()) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof (entry as { id?: unknown }).id !== "string"
    ) {
      throw new Error(
        `ragEval: scenarios file '${absolute}' entry #${index} is missing a string 'id'`,
      );
    }
  }
  return parsed as RagEvalScenario[];
}
