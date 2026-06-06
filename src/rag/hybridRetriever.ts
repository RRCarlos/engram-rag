import {
  type DocumentChunk,
  type RagQuery,
  type RagRetrievalResponse,
  type RagRetrievalResult,
  type RagSignalScore,
  type RetrievalMode,
  parseRagQuery,
  parseRagRetrievalResponse,
} from "../contracts/rag.js";
import type { Embedder } from "./embedder/embedder.js";
import { buildGraphIndex, type GraphIndex } from "./graphIndex/store.js";
import { traverseOneHop } from "./graphIndex/traverse.js";
import { retrieveChunks } from "./retriever.js";
import { fuseRankings } from "./rrf.js";
import {
  type VectorIndexEntry,
} from "./vectorIndex/store.js";
import { cosineTopK } from "./vectorIndex/cosine.js";

export type RetrieveHybridOptions = {
  embedder: Embedder;
  mode: RetrievalMode;
  /**
   * Optional in-memory vector index. When absent, semantic ranking falls
   * back to lexical (per spec scenario "Fall back to lexical when no
   * semantic index exists").
   */
  prebuiltEntries?: VectorIndexEntry[];
  /** Optional in-memory graph index. When absent, the graph signal is omitted. */
  prebuiltGraph?: GraphIndex;
  /** Dictionary used to build the graph on demand when `prebuiltGraph` is absent. */
  graphDictionary?: readonly string[];
  /** Edge cap override for graph traversal. Defaults to the index's edgeCap (8). */
  edgeCap?: number;
  /** RRF `k` constant. Defaults to 60. */
  k?: number;
  /** Cache root for on-demand index building. Defaults to `.rag`. */
  cacheRoot?: string;
  /** Corpus hash used to name the on-disk graph index. */
  corpusHash?: string;
};

type LexicalRanking = { chunk_id: string; rank: number; score: number };

function lexicalRanking(query: RagQuery, chunks: DocumentChunk[]): LexicalRanking[] {
  const response = retrieveChunks(query, chunks);
  return response.results.map((result, index) => ({
    chunk_id: result.chunk_id,
    rank: index,
    score: result.score,
  }));
}

function semanticRanking(
  query: RagQuery,
  chunks: DocumentChunk[],
  entries: VectorIndexEntry[],
  embedder: Embedder,
): LexicalRanking[] {
  if (entries.length === 0) {
    return [];
  }
  const queryVector = embedder.embed(query.text);
  const topK = cosineTopK(queryVector, entries, query.top_k);
  return topK.map((hit, index) => ({
    chunk_id: hit.id,
    rank: index,
    score: hit.score,
  }));
}

function ensureGraphIndex(
  query: RagQuery,
  chunks: DocumentChunk[],
  options: RetrieveHybridOptions,
): GraphIndex | null {
  if (options.prebuiltGraph) {
    return options.prebuiltGraph;
  }
  if (options.graphDictionary === undefined) {
    return null;
  }
  const corpusHash = options.corpusHash ?? `adhoc-${chunks.length}`;
  return buildGraphIndex(chunks, {
    corpusHash,
    dictionary: options.graphDictionary,
    ...(options.edgeCap !== undefined ? { edgeCap: options.edgeCap } : {}),
  });
}

function graphRanking(
  query: RagQuery,
  chunks: DocumentChunk[],
  seeds: LexicalRanking[],
  index: GraphIndex,
  edgeCap: number | undefined,
): LexicalRanking[] {
  if (index === null) {
    return [];
  }
  const seedIds = seeds.slice(0, query.top_k).map((seed) => seed.chunk_id);
  if (seedIds.length === 0) {
    return [];
  }
  const hits = traverseOneHop(
    seedIds,
    index,
    chunks,
    edgeCap !== undefined ? { edgeCap } : {},
  );
  return hits.map((hit, idx) => ({
    chunk_id: hit.chunk_id,
    rank: idx,
    score: hit.score,
  }));
}

function toRagSignals(entries: readonly LexicalRanking[]): RagSignalScore[] {
  return entries.map((entry) => ({
    chunk_id: entry.chunk_id,
    rank: entry.rank,
    score: entry.score,
  }));
}

function toRagSignal(entry: LexicalRanking | undefined): RagSignalScore[] {
  return entry ? [{ chunk_id: entry.chunk_id, rank: entry.rank, score: entry.score }] : [];
}

function lexicalSignalFor(
  chunkId: string,
  lexical: readonly LexicalRanking[],
): LexicalRanking | undefined {
  return lexical.find((entry) => entry.chunk_id === chunkId);
}

export function retrieveHybrid(
  queryInput: RagQuery,
  chunks: DocumentChunk[],
  options: RetrieveHybridOptions,
): RagRetrievalResponse {
  const query = parseRagQuery(queryInput);
  const lexical = lexicalRanking(query, chunks);
  const chunkById = new Map(chunks.map((c) => [c.id, c]));

  if (options.mode === "lexical") {
    const results: RagRetrievalResult[] = lexical
      .map((entry): RagRetrievalResult | null => {
        const chunk = chunkById.get(entry.chunk_id);
        if (!chunk) return null;
        return {
          chunk_id: chunk.id,
          score: entry.score,
          snippet: chunk.text,
          citation: chunk.citation,
          signals: {
            lexical: [{ chunk_id: chunk.id, rank: entry.rank, score: entry.score }],
          },
        };
      })
      .filter((r): r is RagRetrievalResult => r !== null);
    return parseRagRetrievalResponse({ query: query.text, top_k: query.top_k, results });
  }

  if (options.mode === "semantic") {
    const entries = options.prebuiltEntries ?? [];
    const ranking = semanticRanking(query, chunks, entries, options.embedder);
    if (ranking.length === 0) {
      // Fall back to lexical per spec scenario.
      const results: RagRetrievalResult[] = lexical
        .slice(0, query.top_k)
        .map((entry): RagRetrievalResult | null => {
          const chunk = chunkById.get(entry.chunk_id);
          if (!chunk) return null;
          return {
            chunk_id: chunk.id,
            score: entry.score,
            snippet: chunk.text,
            citation: chunk.citation,
            signals: {
              semantic: [],
              lexical: [{ chunk_id: chunk.id, rank: entry.rank, score: entry.score }],
            },
          };
        })
        .filter((r): r is RagRetrievalResult => r !== null);
      return parseRagRetrievalResponse({ query: query.text, top_k: query.top_k, results });
    }
    const results: RagRetrievalResult[] = ranking
      .map((entry): RagRetrievalResult | null => {
        const chunk = chunkById.get(entry.chunk_id);
        if (!chunk) return null;
        return {
          chunk_id: chunk.id,
          score: entry.score,
          snippet: chunk.text,
          citation: chunk.citation,
          signals: {
            semantic: [{ chunk_id: chunk.id, rank: entry.rank, score: entry.score }],
            lexical: toRagSignal(lexicalSignalFor(chunk.id, lexical)),
          },
        };
      })
      .filter((r): r is RagRetrievalResult => r !== null);
    return parseRagRetrievalResponse({ query: query.text, top_k: query.top_k, results });
  }

  // graph + hybrid both need a graph index. Build on demand when possible.
  const graphIndex = ensureGraphIndex(query, chunks, options);

  if (options.mode === "graph") {
    if (!graphIndex) {
      // No graph available: return lexical results without a graph signal.
      const results: RagRetrievalResult[] = lexical
        .slice(0, query.top_k)
        .map((entry): RagRetrievalResult | null => {
          const chunk = chunkById.get(entry.chunk_id);
          if (!chunk) return null;
          return {
            chunk_id: chunk.id,
            score: entry.score,
            snippet: chunk.text,
            citation: chunk.citation,
            signals: {
              lexical: [{ chunk_id: chunk.id, rank: entry.rank, score: entry.score }],
            },
          };
        })
        .filter((r): r is RagRetrievalResult => r !== null);
      return parseRagRetrievalResponse({ query: query.text, top_k: query.top_k, results });
    }
    const ranking = graphRanking(query, chunks, lexical, graphIndex, options.edgeCap);
    const results: RagRetrievalResult[] = ranking
      .map((entry): RagRetrievalResult | null => {
        const chunk = chunkById.get(entry.chunk_id);
        if (!chunk) return null;
        const lexicalEntry = lexical.find((l) => l.chunk_id === chunk.id);
        return {
          chunk_id: chunk.id,
          score: entry.score,
          snippet: chunk.text,
          citation: chunk.citation,
          signals: {
            graph: [{ chunk_id: chunk.id, rank: entry.rank, score: entry.score }],
            lexical: toRagSignal(lexicalEntry),
          },
        };
      })
      .filter((r): r is RagRetrievalResult => r !== null);
    return parseRagRetrievalResponse({ query: query.text, top_k: query.top_k, results });
  }

  // mode === "hybrid"
  const entries = options.prebuiltEntries ?? [];
  const semantic = semanticRanking(query, chunks, entries, options.embedder);
  const graph = graphIndex
    ? graphRanking(query, chunks, lexical, graphIndex, options.edgeCap)
    : [];
  const fused = fuseRankings(
    [lexical, semantic, graph],
    options.k,
  ).slice(0, query.top_k);

  const signalsByChunk = new Map<
    string,
    {
      lexical?: LexicalRanking;
      semantic?: LexicalRanking;
      graph?: LexicalRanking;
    }
  >();
  for (const entry of lexical) {
    const current = signalsByChunk.get(entry.chunk_id) ?? {};
    current.lexical = entry;
    signalsByChunk.set(entry.chunk_id, current);
  }
  for (const entry of semantic) {
    const current = signalsByChunk.get(entry.chunk_id) ?? {};
    current.semantic = entry;
    signalsByChunk.set(entry.chunk_id, current);
  }
  for (const entry of graph) {
    const current = signalsByChunk.get(entry.chunk_id) ?? {};
    current.graph = entry;
    signalsByChunk.set(entry.chunk_id, current);
  }

  const results: RagRetrievalResult[] = fused
    .map((entry): RagRetrievalResult | null => {
      const chunk = chunkById.get(entry.chunk_id);
      if (!chunk) return null;
      const signals = signalsByChunk.get(entry.chunk_id) ?? {};
      return {
        chunk_id: chunk.id,
        score: entry.score,
        snippet: chunk.text,
        citation: chunk.citation,
        signals: {
          lexical: toRagSignal(signals.lexical),
          semantic: toRagSignal(signals.semantic),
          graph: toRagSignal(signals.graph),
          fused: [{ chunk_id: chunk.id, rank: entry.rank, score: entry.score }],
        },
      };
    })
    .filter((r): r is RagRetrievalResult => r !== null);

  return parseRagRetrievalResponse({
    query: query.text,
    top_k: query.top_k,
    results,
  });
}
