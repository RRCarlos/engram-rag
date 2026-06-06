import type { DocumentChunk } from "../contracts/rag.js";
import { retrieveChunks } from "./retriever.js";

export type RagEvalScenario = {
  id: string;
  query: string;
  top_k: number;
  expected_chunk_ids: string[];
};

export type RagEvalCitation = {
  chunk_id: string;
  document_id: string;
  source_path: string;
};

export type RagEvalResult = {
  id: string;
  status: "PASS" | "FAIL";
  matched_chunk_ids: string[];
  missing_chunk_ids: string[];
  citations: RagEvalCitation[];
};

export type RagEvalReport = {
  scenarios_total: number;
  scenarios_passed: number;
  results: RagEvalResult[];
};

export function evaluateRagScenarios(
  scenarios: RagEvalScenario[],
  chunks: DocumentChunk[],
): RagEvalReport {
  const results = scenarios.map((scenario) => evaluateScenario(scenario, chunks));

  return {
    scenarios_total: results.length,
    scenarios_passed: results.filter((result) => result.status === "PASS").length,
    results,
  };
}

function evaluateScenario(
  scenario: RagEvalScenario,
  chunks: DocumentChunk[],
): RagEvalResult {
  const response = retrieveChunks(
    { text: scenario.query, top_k: scenario.top_k },
    chunks,
  );
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
    citations: citationResults.map((result) => ({
      chunk_id: result.chunk_id,
      document_id: result.citation.document_id,
      source_path: result.citation.source_path,
    })),
  };
}
