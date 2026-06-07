import type { Embedder } from "./embedder.js";

/**
 * Default deterministic hashing embedder.
 *
 * Algorithm:
 *  - Tokenize on Unicode word boundaries, lowercase, keep ASCII alphanumerics.
 *  - For each token, compute 64-bit FNV-1a hash.
 *  - Use `hash % dimensions` for dimension index (works for any positive integer).
 *  - Use `(hash >> 1) & 1n` for sign bit (valid parity bit from the hash).
 *  - Accumulate `+1` / `-1` into the corresponding dimension.
 *  - L2-normalize the result so Euclidean norm equals 1.
 *
 * The result is fully deterministic, dependency-free, and L2-normalized. The
 * default `dimensions` is 256 per the design; alternative dimensions are
 * available via `createHashingEmbedder(...)` for tests and eval scenarios.
 */
const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const DEFAULT_DIMENSIONS = 256;

function fnv1a64(input: string): bigint {
  let hash = FNV_OFFSET;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * FNV_PRIME) & 0xffffffffffffffffn;
  }
  return hash;
}

function tokenize(text: string): string[] {
  return Array.from(text.toLowerCase().matchAll(/[a-z0-9]+/g), (match) => match[0]);
}

export function createHashingEmbedder(dimensions: number): Embedder {
  if (!Number.isInteger(dimensions) || dimensions <= 0) {
    throw new Error(`hashingEmbedder: dimensions must be a positive integer (got ${dimensions})`);
  }
  return {
    id: "hashing",
    dimensions,
    embed(text: string): number[] {
      const vector = new Array<number>(dimensions).fill(0);
      if (text.length === 0) {
        return vector;
      }
      const tokens = tokenize(text);
      if (tokens.length === 0) {
        return vector;
      }
      for (const token of tokens) {
        const hash = fnv1a64(token);
        // Use modulo for dimension index (works for any positive integer, not just powers of 2)
        const dimIndex = Number(hash % BigInt(dimensions));
        // Use a valid parity bit from the hash: bit 1 (after shifting by 1)
        // The original `hash >> 64n` was always 0 because hash is masked to 64 bits
        const sign = ((hash >> 1n) & 1n) === 0n ? 1 : -1;
        const current = vector[dimIndex] ?? 0;
        vector[dimIndex] = current + sign;
      }
      let norm = 0;
      for (const value of vector) {
        norm += value * value;
      }
      if (norm === 0) {
        return vector;
      }
      const scale = 1 / Math.sqrt(norm);
      for (let i = 0; i < vector.length; i += 1) {
        vector[i] = (vector[i] ?? 0) * scale;
      }
      return vector;
    },
  };
}

export const hashingEmbedder: Embedder = createHashingEmbedder(DEFAULT_DIMENSIONS);
