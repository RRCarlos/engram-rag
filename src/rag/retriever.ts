import {
  type DocumentChunk,
  type RagQuery,
  type RagRetrievalResponse,
  parseRagQuery,
  parseRagRetrievalResponse,
} from "../contracts/rag.js";

type ScoredChunk = {
  chunk: DocumentChunk;
  score: number;
};

export function retrieveChunks(
  queryInput: RagQuery,
  chunks: DocumentChunk[],
): RagRetrievalResponse {
  const query = parseRagQuery(queryInput);
  const terms = normalizeTerms(query.text);

  const results = chunks
    .map((chunk): ScoredChunk => ({ chunk, score: scoreChunk(terms, chunk.text) }))
    .filter((scored) => scored.score > 0)
    .sort(compareScoredChunks)
    .slice(0, query.top_k)
    .map(({ chunk, score }) => ({
      chunk_id: chunk.id,
      score,
      snippet: chunk.text,
      citation: chunk.citation,
    }));

  return parseRagRetrievalResponse({
    query: query.text,
    top_k: query.top_k,
    results,
  });
}

function normalizeTerms(text: string): string[] {
  return Array.from(text.toLowerCase().matchAll(/[a-z0-9]+/g), (match) => match[0]);
}

function scoreChunk(terms: string[], text: string): number {
  const chunkTerms = normalizeTerms(text);
  return terms.reduce(
    (score, term) => score + chunkTerms.filter((chunkTerm) => chunkTerm === term).length,
    0,
  );
}

function compareScoredChunks(left: ScoredChunk, right: ScoredChunk): number {
  if (left.score !== right.score) {
    return right.score - left.score;
  }

  return left.chunk.id.localeCompare(right.chunk.id);
}
