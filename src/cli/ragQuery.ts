import { chunkDocuments } from "../rag/chunker.js";
import { loadCorpusDocuments } from "../rag/corpusLoader.js";
import { retrieveChunks } from "../rag/retriever.js";
import { type DocumentChunk, type RetrievalMode, RetrievalModeSchema } from "../contracts/rag.js";
import { retrieveHybrid } from "../rag/hybridRetriever.js";
import { computeCorpusHash } from "../rag/semanticRetriever.js";
import { buildGraphIndex } from "../rag/graphIndex/store.js";
import { hashingEmbedder } from "../rag/embedder/hashingEmbedder.js";
import type { Embedder } from "../rag/embedder/embedder.js";
import { type VectorIndexEntry } from "../rag/vectorIndex/store.js";
import { isRegistered, resolveEmbedder } from "../rag/embedder/registry.js";

type RagQueryCliOptions = {
  query?: string;
  topK?: number;
  corpusDir?: string;
  mode?: string;
  embedder?: string;
};

const DEFAULT_EMBEDDER_ID = "default";
const DEFAULT_MODE: RetrievalMode = "lexical";

/**
 * Default co-mention graph dictionary used when the CLI builds a graph index
 * in-memory for non-lexical modes. Curated to match the fixture corpus so
 * 1-hop expansion produces at least one neighbor per seed.
 */
const DEFAULT_CLI_GRAPH_DICTIONARY: readonly string[] = [
  "alpha",
  "beta",
  "gamma",
  "delta",
  "retrieval",
  "ranking",
  "lexical",
  "citations",
];

export async function runRagQueryCli(argv = process.argv.slice(2)): Promise<number> {
  try {
    const options = parseArgs(argv);
    const { mode } = validateOptions(options);
    const documents = await loadCorpusDocuments(options.corpusDir);
    const chunks = chunkDocuments(documents);
    const response = await dispatchRetrieval(mode, options, chunks);

    process.stdout.write(`${JSON.stringify(response)}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

async function dispatchRetrieval(
  mode: RetrievalMode,
  options: RagQueryCliOptions,
  chunks: DocumentChunk[],
): Promise<unknown> {
  const queryInput = { text: options.query ?? "", top_k: options.topK ?? 5 };
  if (mode === "lexical") {
    return retrieveChunks(queryInput, chunks);
  }
  const embedder = resolveCliEmbedder(options.embedder ?? DEFAULT_EMBEDDER_ID);
  const corpusHash = computeCorpusHash(chunks);
  const prebuiltEntries: VectorIndexEntry[] = chunks.map((chunk) => ({
    id: chunk.id,
    vector: embedder.embed(chunk.text),
  }));
  const prebuiltGraph = buildGraphIndex(chunks, {
    corpusHash,
    dictionary: DEFAULT_CLI_GRAPH_DICTIONARY,
  });
  return retrieveHybrid(queryInput, chunks, {
    embedder,
    mode,
    prebuiltEntries,
    prebuiltGraph,
    corpusHash,
  });
}

function resolveCliEmbedder(id: string): Embedder {
  if (id === DEFAULT_EMBEDDER_ID) {
    return hashingEmbedder;
  }
  if (!isRegistered(id)) {
    throw new Error(
      `--embedder '${id}' is not registered; use --embedder ${DEFAULT_EMBEDDER_ID} or a registered id (registered: hashing)`,
    );
  }
  return resolveEmbedder(id);
}

function validateOptions(options: RagQueryCliOptions): { mode: RetrievalMode } {
  const errors: string[] = [];
  let mode: RetrievalMode = DEFAULT_MODE;

  if (!options.query) {
    errors.push("--query is required");
  }

  if (options.topK !== undefined && (!Number.isInteger(options.topK) || options.topK <= 0)) {
    errors.push("--top-k must be a positive integer");
  }

  if (options.mode !== undefined) {
    const parsed = RetrievalModeSchema.safeParse(options.mode);
    if (parsed.success) {
      mode = parsed.data;
    } else {
      errors.push(
        `--mode must be one of lexical|semantic|graph|hybrid (got '${options.mode}')`,
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join("; "));
  }
  return { mode };
}

type FlagParser<T> = (raw: string, flag: string) => T;

type FlagSpec = {
  flag: string;
  parse: FlagParser<string | number>;
  assign: (options: RagQueryCliOptions, value: string | number) => void;
};

const FLAG_SPECS: ReadonlyArray<FlagSpec> = [
  { flag: "--query", parse: parseString, assign: (o, v) => { o.query = v as string; } },
  { flag: "--top-k", parse: parseNumber, assign: (o, v) => { o.topK = v as number; } },
  { flag: "--corpus-dir", parse: parseString, assign: (o, v) => { o.corpusDir = v as string; } },
  { flag: "--mode", parse: parseString, assign: (o, v) => { o.mode = v as string; } },
  { flag: "--embedder", parse: parseString, assign: (o, v) => { o.embedder = v as string; } },
];

function parseArgs(argv: string[]): RagQueryCliOptions {
  const options: RagQueryCliOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const spec = FLAG_SPECS.find((candidate) => candidate.flag === arg);
    if (spec) {
      const value = readFlagValue(argv, index, spec.flag, spec.parse);
      spec.assign(options, value);
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${arg ?? "<empty>"}`);
  }

  return options;
}

function readFlagValue<T>(
  argv: string[],
  index: number,
  flag: string,
  parse: FlagParser<T>,
): T {
  const value = argv[index + 1];
  if (value === undefined) {
    throw new Error(`${flag} requires a value`);
  }
  return parse(value, flag);
}

function parseString(raw: string, _flag: string): string {
  // Empty values are valid at parse time; semantic validation (e.g.
  // `--query is required`) lives in `validateOptions` so the error
  // message matches the existing archive CLI baseline.
  return raw;
}

function parseNumber(raw: string, flag: string): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${flag} must be a number (got '${raw}')`);
  }
  return parsed;
}

if (process.argv[1]?.endsWith("ragQuery.ts")) {
  process.exitCode = await runRagQueryCli();
}

