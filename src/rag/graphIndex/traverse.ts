import { type DocumentChunk } from "../../contracts/rag.js";
import { type GraphIndex, DEFAULT_GRAPH_EDGE_CAP } from "./store.js";

export type TraverseHit = {
  chunk_id: string;
  score: number;
};

export type TraverseOptions = {
  /**
   * Maximum number of neighbor chunks pulled in per seed chunk. Matches
   * the per-node edge cap stored in the index by default.
   */
  edgeCap?: number;
};

/**
 * 1-hop co-mention expansion with a deterministic edge-weighted score.
 *
 * For each seed chunk, the algorithm:
 *   1. Computes the set of entities mentioned in the seed.
 *   2. Finds neighbor chunks that share at least one of those entities.
 *   3. Caps the neighbor list at `edgeCap` entries (sorted by chunk id).
 *   4. Scores each neighbor by the number of shared entities, normalized
 *      by the number of seed entities so the score lies in `[0, 1]`.
 *
 * Seeds always receive a score of `1`. The result is sorted by descending
 * score with a chunk-id tie-break so the output is stable.
 */
export function traverseOneHop(
  seedIds: readonly string[],
  index: GraphIndex,
  _chunks: readonly DocumentChunk[],
  options: TraverseOptions = {},
): TraverseHit[] {
  const edgeCap = options.edgeCap ?? index.edgeCap ?? DEFAULT_GRAPH_EDGE_CAP;
  if (!Number.isInteger(edgeCap) || edgeCap <= 0) {
    throw new Error(
      `graphIndex/traverse: edgeCap must be a positive integer (got ${edgeCap})`,
    );
  }
  if (seedIds.length === 0) {
    return [];
  }

  // Deduplicate seeds, preserving the first occurrence.
  const seen = new Set<string>();
  const orderedSeeds: string[] = [];
  for (const id of seedIds) {
    if (!seen.has(id)) {
      seen.add(id);
      orderedSeeds.push(id);
    }
  }

  const seedEntitiesById = new Map<string, string[]>();
  for (const seed of orderedSeeds) {
    const entities = index.chunkEntities[seed] ?? [];
    seedEntitiesById.set(seed, entities);
  }

  const scoreByChunk = new Map<string, number>();
  // Seeds always score 1.0 and pre-empt neighbors with the same id.
  for (const seed of orderedSeeds) {
    scoreByChunk.set(seed, 1);
  }

  for (const seed of orderedSeeds) {
    const seedEntities = seedEntitiesById.get(seed) ?? [];
    if (seedEntities.length === 0) {
      continue;
    }
    // Gather candidate neighbor chunks via the entity -> chunks index.
    const candidates = new Set<string>();
    for (const entity of seedEntities) {
      const chunkIds = index.entityChunks[entity] ?? [];
      for (const id of chunkIds) {
        if (id !== seed) {
          candidates.add(id);
        }
      }
    }
    const orderedCandidates = Array.from(candidates).sort((a, b) => a.localeCompare(b));
    const cappedNeighbors = orderedCandidates.slice(0, edgeCap);
    for (const neighbor of cappedNeighbors) {
      const neighborEntities = index.chunkEntities[neighbor] ?? [];
      const seedSet = new Set(seedEntities);
      let shared = 0;
      for (const entity of neighborEntities) {
        if (seedSet.has(entity)) {
          shared += 1;
        }
      }
      const score = shared / seedEntities.length;
      // Keep the maximum score when a chunk is reached by multiple seeds.
      const current = scoreByChunk.get(neighbor);
      if (current === undefined || score > current) {
        scoreByChunk.set(neighbor, score);
      }
    }
  }

  const hits = Array.from(scoreByChunk.entries()).map(([chunk_id, score]) => ({
    chunk_id,
    score: clamp01(score),
  }));
  hits.sort((left, right) => {
    if (left.score !== right.score) {
      return right.score - left.score;
    }
    return left.chunk_id.localeCompare(right.chunk_id);
  });
  return hits;
}

function clamp01(value: number): number {
  if (value > 1) return 1;
  if (value < 0) return 0;
  return value;
}
