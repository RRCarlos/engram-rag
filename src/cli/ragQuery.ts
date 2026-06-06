import { chunkDocuments } from "../rag/chunker.js";
import { loadCorpusDocuments } from "../rag/corpusLoader.js";
import { retrieveChunks } from "../rag/retriever.js";

type RagQueryCliOptions = {
  query?: string;
  topK?: number;
  corpusDir?: string;
};

export async function runRagQueryCli(argv = process.argv.slice(2)): Promise<number> {
  try {
    const options = parseArgs(argv);
    validateOptions(options);
    const documents = await loadCorpusDocuments(options.corpusDir);
    const chunks = chunkDocuments(documents);
    const response = retrieveChunks(
      { text: options.query ?? "", top_k: options.topK ?? 5 },
      chunks,
    );

    process.stdout.write(`${JSON.stringify(response)}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

function validateOptions(options: RagQueryCliOptions): void {
  const errors: string[] = [];

  if (!options.query) {
    errors.push("--query is required");
  }

  if (options.topK !== undefined && (!Number.isInteger(options.topK) || options.topK <= 0)) {
    errors.push("--top-k must be a positive integer");
  }

  if (errors.length > 0) {
    throw new Error(errors.join("; "));
  }
}

function parseArgs(argv: string[]): RagQueryCliOptions {
  const options: RagQueryCliOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];

    if (arg === "--query") {
      options.query = value ?? "";
      index += 1;
      continue;
    }

    if (arg === "--top-k") {
      options.topK = Number(value);
      index += 1;
      continue;
    }

    if (arg === "--corpus-dir") {
      if (value === undefined) {
        throw new Error("--corpus-dir requires a value");
      }
      options.corpusDir = value;
      index += 1;
      continue;
    }

    throw new Error(`unknown argument: ${arg ?? "<empty>"}`);
  }

  return options;
}

if (process.argv[1]?.endsWith("ragQuery.ts")) {
  process.exitCode = await runRagQueryCli();
}
