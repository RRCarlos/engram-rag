import { EmbedderIdSchema } from "../../contracts/rag.js";
import { hashingEmbedder } from "./hashingEmbedder.js";
import type { Embedder } from "./embedder.js";

const registry = new Map<string, Embedder>();

function validate(embedder: Embedder): void {
  const idParse = EmbedderIdSchema.safeParse(embedder.id);
  if (!idParse.success) {
    throw new Error(
      `embedder registry: invalid id (${embedder.id}): ${idParse.error.issues
        .map((issue) => issue.message)
        .join("; ")}`,
    );
  }
  if (!Number.isInteger(embedder.dimensions) || embedder.dimensions <= 0) {
    throw new Error(
      `embedder registry: dimensions must be a positive integer (got ${embedder.dimensions})`,
    );
  }
  // Probe the embedder with an empty-ish string to verify the declared
  // dimensions actually match the produced vector length.
  const probe = embedder.embed("registry-probe");
  if (probe.length !== embedder.dimensions) {
    throw new Error(
      `embedder registry: '${embedder.id}' embed() returned length ${probe.length} but declared dimensions ${embedder.dimensions}`,
    );
  }
  for (const value of probe) {
    if (!Number.isFinite(value)) {
      throw new Error(
        `embedder registry: '${embedder.id}' embed() produced a non-finite value`,
      );
    }
  }
}

export function registerEmbedder(embedder: Embedder): void {
  validate(embedder);
  if (registry.has(embedder.id)) {
    throw new Error(
      `embedder registry: id '${embedder.id}' is already registered; duplicate registration is rejected`,
    );
  }
  registry.set(embedder.id, embedder);
}

export function resolveEmbedder(id: string): Embedder {
  const embedder = registry.get(id);
  if (!embedder) {
    throw new Error(`embedder registry: no embedder registered under id '${id}'`);
  }
  return embedder;
}

export function isRegistered(id: string): boolean {
  return registry.has(id);
}

export function clearEmbedderRegistry(): void {
  registry.clear();
}

// Default registration: the deterministic hashing embedder is always present.
registerEmbedder(hashingEmbedder);
