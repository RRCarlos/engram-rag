import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type DocumentChunk } from "../../contracts/rag.js";
import { extractEntities, type ExtractOptions } from "./extract.js";

/**
 * Co-mention graph index.
 *
 * Stored as plain JSON so callers can persist, load, and inspect the
 * adjacency structure with no extra dependencies.
 */
export type GraphIndex = {
  corpusHash: string;
  edgeCap: number;
  /** Entities (sorted, lowercased) extracted from each chunk. */
  chunkEntities: Record<string, string[]>;
  /** Chunks (sorted by id) that mention each entity. */
  entityChunks: Record<string, string[]>;
  /** Undirected edges per entity node, capped at `edgeCap` neighbors. */
  entityEdges: Record<string, string[]>;
};

export const DEFAULT_GRAPH_EDGE_CAP = 8;

export type BuildGraphIndexOptions = ExtractOptions & {
  corpusHash: string;
  edgeCap?: number;
};

/**
 * File-system path for a cached graph index. The path is anchored at a
 * caller-provided root (defaults to `.rag/`) and namespaced by `corpusHash`
 * so different corpora never collide.
 */
export function graphIndexPath(root: string, corpusHash: string): string {
  return join(root, "graph", `${corpusHash}.json`);
}

function validateEdgeCap(edgeCap: number): void {
  if (!Number.isInteger(edgeCap) || edgeCap <= 0) {
    throw new Error(
      `graphIndex/store: edgeCap must be a positive integer (got ${edgeCap})`,
    );
  }
}

function buildAdjacency(
  chunkEntities: Record<string, string[]>,
  entityChunks: Record<string, string[]>,
  edgeCap: number,
): Record<string, string[]> {
  const edges: Record<string, string[]> = {};
  for (const [entity, chunkIds] of Object.entries(entityChunks)) {
    if (chunkIds.length < 2) {
      // Single-mention entities produce no co-mention edges.
      edges[entity] = [];
      continue;
    }
    const coEntities = new Set<string>();
    for (const chunkId of chunkIds) {
      const entities = chunkEntities[chunkId] ?? [];
      for (const other of entities) {
        if (other !== entity) {
          coEntities.add(other);
        }
      }
    }
    const sortedNeighbors = Array.from(coEntities).sort((a, b) => a.localeCompare(b));
    edges[entity] = sortedNeighbors.slice(0, edgeCap);
  }
  return edges;
}

export function buildGraphIndex(
  chunks: DocumentChunk[],
  options: BuildGraphIndexOptions,
): GraphIndex {
  const edgeCap = options.edgeCap ?? DEFAULT_GRAPH_EDGE_CAP;
  validateEdgeCap(edgeCap);

  const chunkEntities: Record<string, string[]> = {};
  const entityChunks: Record<string, string[]> = {};
  const sortedChunks = [...chunks].sort((left, right) => left.id.localeCompare(right.id));
  for (const chunk of sortedChunks) {
    const entities = extractEntities(chunk.text, options);
    chunkEntities[chunk.id] = entities;
    for (const entity of entities) {
      const list = entityChunks[entity] ?? [];
      list.push(chunk.id);
      entityChunks[entity] = list;
    }
  }
  for (const entity of Object.keys(entityChunks)) {
    const sorted = (entityChunks[entity] ?? []).slice().sort((a, b) => a.localeCompare(b));
    entityChunks[entity] = sorted;
  }
  const entityEdges = buildAdjacency(chunkEntities, entityChunks, edgeCap);
  return {
    corpusHash: options.corpusHash,
    edgeCap,
    chunkEntities,
    entityChunks,
    entityEdges,
  };
}

function validate(snapshot: GraphIndex): void {
  if (!snapshot.corpusHash || snapshot.corpusHash.length === 0) {
    throw new Error("graphIndex/store: corpusHash must be non-empty");
  }
  validateEdgeCap(snapshot.edgeCap);
  for (const [chunkId, entities] of Object.entries(snapshot.chunkEntities)) {
    if (!chunkId) {
      throw new Error("graphIndex/store: chunkEntities key must be non-empty");
    }
    for (const entity of entities) {
      if (!entity || entity !== entity.toLowerCase()) {
        throw new Error(
          `graphIndex/store: chunkEntities['${chunkId}'] contains a non-canonical entity '${entity}'`,
        );
      }
    }
  }
  for (const [entity, neighbors] of Object.entries(snapshot.entityEdges)) {
    if (neighbors.length > snapshot.edgeCap) {
      throw new Error(
        `graphIndex/store: entity '${entity}' has ${neighbors.length} neighbors, exceeds edgeCap ${snapshot.edgeCap}`,
      );
    }
  }
}

export async function saveGraphIndex(
  root: string,
  corpusHash: string,
  snapshot: GraphIndex,
): Promise<void> {
  if (snapshot.corpusHash !== corpusHash) {
    throw new Error(
      `graphIndex/store: snapshot corpusHash '${snapshot.corpusHash}' does not match path corpusHash '${corpusHash}'`,
    );
  }
  validate(snapshot);
  const path = graphIndexPath(root, corpusHash);
  await mkdir(join(root, "graph"), { recursive: true });
  await writeFile(path, JSON.stringify(snapshot, null, 2), "utf8");
}

export async function loadGraphIndex(
  root: string,
  corpusHash: string,
): Promise<GraphIndex | null> {
  const path = graphIndexPath(root, corpusHash);
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
  const parsed: unknown = JSON.parse(raw);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("chunkEntities" in parsed) ||
    !("entityChunks" in parsed) ||
    !("entityEdges" in parsed) ||
    !("corpusHash" in parsed) ||
    !("edgeCap" in parsed)
  ) {
    throw new Error(`graphIndex/store: malformed cache file at ${path}`);
  }
  const snapshot = parsed as GraphIndex;
  if (snapshot.corpusHash !== corpusHash) {
    throw new Error(
      `graphIndex/store: cache at ${path} reports corpusHash '${snapshot.corpusHash}', expected '${corpusHash}'`,
    );
  }
  validate(snapshot);
  return snapshot;
}
