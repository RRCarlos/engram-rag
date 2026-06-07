import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  type DocumentChunk,
  type RagQuery,
  type RagRetrievalResponse,
  type RagRetrievalResult,
  type RagSignalScore,
  parseRagQuery,
  parseRagRetrievalResponse,
} from "../contracts/rag.js";
import type { Embedder } from "./embedder/embedder.js";
import { retrieveChunks } from "./retriever.js";
import { cosineTopK } from "./vectorIndex/cosine.js";
import {
  type VectorIndexEntry,
  loadVectorIndex,
  saveVectorIndex,
} from "./vectorIndex/store.js";

const DEFAULT_CACHE_ROOT = ".rag";

export type SemanticRetrieveOptions = {
  embedder: Embedder;
  cacheRoot?: string;
  corpusHash?: string;
  /**
   * In-memory override used by callers (and tests) that already hold the
   * vector entries. When set, the cache is bypassed.
   */
  prebuiltEntries?: VectorIndexEntry[];
};

/**
 * Compute a content-and-config-sensitive corpus hash.
 *
 * Includes:
 * - Sorted chunk IDs
 * - Chunk text content (so content edits change hash)
 * - Embedder ID and dimensions (so config edits change hash)
 */
export function computeCorpusHash(
  chunks: DocumentChunk[],
  embedder?: { id: string; dimensions: number },
): string {
  const sorted = [...chunks].sort((a, b) => a.id.localeCompare(b.id));
  const content = sorted.map((c) => `${c.id}\n${c.text}`).join("\n---\n");
  const config = embedder ? `${embedder.id}:${embedder.dimensions}` : "default";
  const input = `${config}\n${content}`;
  return createHash("sha256").update(input, "utf8").digest("hex").slice(0, 16);
}

export async function buildSemanticIndex(
  chunks: DocumentChunk[],
  embedder: Embedder,
  options: { cacheRoot?: string; corpusHash?: string } = {},
): Promise<{ corpusHash: string; entries: VectorIndexEntry[] }> {
  const corpusHash = options.corpusHash ?? computeCorpusHash(chunks);
  const cacheRoot = options.cacheRoot ?? DEFAULT_CACHE_ROOT;
  const cached = await loadVectorIndex(cacheRoot, corpusHash);
  if (cached && cached.length > 0) {
    return { corpusHash, entries: cached };
  }
  const entries: VectorIndexEntry[] = chunks.map((chunk) => ({
    id: chunk.id,
    vector: embedder.embed(chunk.text),
  }));
  await mkdir(join(cacheRoot, "vector"), { recursive: true });
  await saveVectorIndex(cacheRoot, corpusHash, entries);
  return { corpusHash, entries };
}

export function semanticRetrieveSync(
  queryInput: RagQuery,
  chunks: DocumentChunk[],
  options: SemanticRetrieveOptions,
): RagRetrievalResponse {
  const query = parseRagQuery(queryInput);

  const entries = options.prebuiltEntries ?? [];
  if (entries.length === 0) {
    return lexicalFallback(query, chunks);
  }

  const queryVector = options.embedder.embed(query.text);
  const topK = cosineTopK(queryVector, entries, query.top_k);
  const chunkById = new Map(chunks.map((c) => [c.id, c]));

  const results: RagRetrievalResult[] = topK
    .map((hit): RagRetrievalResult | null => {
      const chunk = chunkById.get(hit.id);
      if (!chunk) return null;
      const semanticSignal: RagSignalScore = {
        chunk_id: chunk.id,
        rank: 0,
        score: hit.score,
      };
      return {
        chunk_id: chunk.id,
        score: hit.score,
        snippet: chunk.text,
        citation: chunk.citation,
        signals: { semantic: [semanticSignal] },
      };
    })
    .filter((result): result is RagRetrievalResult => result !== null);

  return parseRagRetrievalResponse({
    query: query.text,
    top_k: query.top_k,
    results,
  });
}

export function semanticRetrieve(
  queryInput: RagQuery,
  chunks: DocumentChunk[],
  options: SemanticRetrieveOptions,
): RagRetrievalResponse {
  const query = parseRagQuery(queryInput);

  if (options.prebuiltEntries && options.prebuiltEntries.length === 0) {
    return lexicalFallback(query, chunks);
  }

  let entries = options.prebuiltEntries;
  if (!entries) {
    // Build (and persist) a semantic index synchronously per embedder
    // call. This is the cold-start path; cached callers can pass
    // `prebuiltEntries` to avoid the embedding work.
    entries = chunks.map((chunk) => ({
      id: chunk.id,
      vector: options.embedder.embed(chunk.text),
    }));
  }

  if (entries.length === 0) {
    return lexicalFallback(query, chunks);
  }

  const queryVector = options.embedder.embed(query.text);
  const topK = cosineTopK(queryVector, entries, query.top_k);
  const chunkById = new Map(chunks.map((c) => [c.id, c]));

  const results: RagRetrievalResult[] = topK
    .map((hit): RagRetrievalResult | null => {
      const chunk = chunkById.get(hit.id);
      if (!chunk) return null;
      const semanticSignal: RagSignalScore = {
        chunk_id: chunk.id,
        rank: 0,
        score: hit.score,
      };
      return {
        chunk_id: chunk.id,
        score: hit.score,
        snippet: chunk.text,
        citation: chunk.citation,
        signals: { semantic: [semanticSignal] },
      };
    })
    .filter((result): result is RagRetrievalResult => result !== null);

  return parseRagRetrievalResponse({
    query: query.text,
    top_k: query.top_k,
    results,
  });
}

function lexicalFallback(
  query: ReturnType<typeof parseRagQuery>,
  chunks: DocumentChunk[],
): RagRetrievalResponse {
  const lexical = retrieveChunks(query, chunks);
  const withSignals: RagRetrievalResult[] = lexical.results.map((result) => ({
    ...result,
    signals: {
      semantic: [],
      lexical: [
        {
          chunk_id: result.chunk_id,
          rank: lexical.results.findIndex((r) => r.chunk_id === result.chunk_id),
          score: result.score,
        },
      ],
    },
  }));
  return parseRagRetrievalResponse({
    query: lexical.query,
    top_k: lexical.top_k,
    results: withSignals,
  });
}
