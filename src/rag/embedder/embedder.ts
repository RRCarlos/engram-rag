/**
 * Embedder contract for semantic retrieval.
 *
 * The interface is the integration boundary between the RAG pipeline and any
 * future model-based adapter. The deterministic hashing implementation lives
 * in `hashingEmbedder.ts` and is the default registered implementation.
 */
export interface Embedder {
  readonly id: string;
  readonly dimensions: number;
  /**
   * Synchronous, deterministic text-to-vector mapping.
   * MUST return a fresh array on every call.
   */
  embed(text: string): number[];
}
