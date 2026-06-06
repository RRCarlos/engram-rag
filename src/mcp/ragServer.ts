import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { retrieveChunks } from "../rag/retriever.js";
import { retrieveHybrid } from "../rag/hybridRetriever.js";
import { buildSemanticIndex, computeCorpusHash } from "../rag/semanticRetriever.js";
import { loadCorpusDocuments } from "../rag/corpusLoader.js";
import { chunkDocuments } from "../rag/chunker.js";
import { evaluateRagScenarios, loadRagEvalScenarios, type RagEvalOptions } from "../rag/ragEval.js";
import { RetrievalModeSchema, EmbedderIdSchema } from "../contracts/rag.js";
import { resolveEmbedder, isRegistered } from "../rag/embedder/registry.js";
import { buildGraphIndex } from "../rag/graphIndex/store.js";
import type { VectorIndexEntry } from "../rag/vectorIndex/store.js";
import type { Embedder } from "../rag/embedder/embedder.js";

const server = new Server(
  {
    name: "engram-rag",
    version: "2.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "rag_query",
      description: "Query the RAG system with lexical, semantic, graph, or hybrid retrieval. Returns citation-ready JSON.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query" },
          top_k: { type: "number", description: "Number of results to return", default: 5 },
          mode: { type: "string", enum: ["lexical", "semantic", "graph", "hybrid"], description: "Retrieval mode", default: "lexical" },
          embedder: { type: "string", description: "Embedder ID (default, hashing, etc.)", default: "default" },
          corpus_dir: { type: "string", description: "Custom corpus directory" },
        },
        required: ["query"],
      },
    },
    {
      name: "rag_ingest",
      description: "Ingest documents into the RAG corpus (builds vector + graph indices).",
      inputSchema: {
        type: "object",
        properties: {
          corpus_dir: { type: "string", description: "Corpus directory to ingest", default: "fixtures/corpus" },
          embedder: { type: "string", description: "Embedder ID", default: "default" },
          chunk_size: { type: "number", description: "Chunk size in tokens", default: 256 },
          chunk_overlap: { type: "number", description: "Chunk overlap in tokens", default: 50 },
        },
      },
    },
    {
      name: "rag_eval",
      description: "Run evaluation scenarios against the RAG system.",
      inputSchema: {
        type: "object",
        properties: {
          scenario_file: { type: "string", description: "Path to eval scenarios JSON", default: "eval/rag-scenarios/hybrid.json" },
          mode: { type: "string", enum: ["lexical", "semantic", "graph", "hybrid"], default: "hybrid" },
        },
      },
    },
    {
      name: "rag_stats",
      description: "Get statistics about the current corpus and indices.",
      inputSchema: {
        type: "object",
        properties: {
          corpus_dir: { type: "string", description: "Corpus directory", default: "fixtures/corpus" },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "rag_query": {
        const { query, top_k = 5, mode = "lexical", embedder = "default", corpus_dir } = args as {
          query: string;
          top_k?: number;
          mode?: "lexical" | "semantic" | "graph" | "hybrid";
          embedder?: string;
          corpus_dir?: string;
        };

        const validatedMode = RetrievalModeSchema.parse(mode);

        const documents = await loadCorpusDocuments(corpus_dir);
        const chunks = chunkDocuments(documents, { maxCharacters: 256 });

        let results;
        if (validatedMode === "lexical") {
          results = retrieveChunks({ text: query, top_k }, chunks);
        } else {
          const embedderInstance = resolveEmbedder(embedder === "default" ? "hashing" : embedder);
          const corpusHash = computeCorpusHash(chunks);
          const prebuiltEntries: VectorIndexEntry[] = chunks.map((chunk) => ({
            id: chunk.id,
            vector: embedderInstance.embed(chunk.text),
          }));
          const prebuiltGraph = buildGraphIndex(chunks, {
            corpusHash,
            dictionary: ["alpha", "beta", "gamma", "delta", "retrieval", "ranking", "lexical", "citations"],
          });
          results = retrieveHybrid(
            { text: query, top_k },
            chunks,
            {
              embedder: embedderInstance,
              mode: validatedMode,
              prebuiltEntries,
              prebuiltGraph,
              corpusHash,
            }
          );
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      }

      case "rag_ingest": {
        const { corpus_dir = "fixtures/corpus", embedder = "default", maxCharacters = 256 } = args as {
          corpus_dir?: string;
          embedder?: string;
          maxCharacters?: number;
        };

        const documents = await loadCorpusDocuments(corpus_dir);
        const chunks = chunkDocuments(documents, { maxCharacters });

        const embedderInstance = resolveEmbedder(embedder === "default" ? "hashing" : embedder);
        await buildSemanticIndex(chunks, embedderInstance, { corpusHash: computeCorpusHash(chunks) });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                documents: documents.length,
                chunks: chunks.length,
                embedder: embedderInstance.id,
                corpus_dir,
              }, null, 2),
            },
          ],
        };
      }

      case "rag_eval": {
        const { scenario_file = "eval/rag-scenarios/hybrid.json", mode = "hybrid" } = args as {
          scenario_file?: string;
          mode?: "lexical" | "semantic" | "graph" | "hybrid";
        };

        const validatedMode = RetrievalModeSchema.parse(mode);
        const scenarios = await loadRagEvalScenarios(scenario_file);
        const documents = await loadCorpusDocuments();
        const chunks = chunkDocuments(documents, { maxCharacters: 256 });

        const evalOptions: RagEvalOptions = {
          defaultMode: validatedMode,
        };

        if (validatedMode !== "lexical") {
          evalOptions.embedder = resolveEmbedder("hashing");
          evalOptions.prebuiltEntries = chunks.map((chunk) => ({
            id: chunk.id,
            vector: evalOptions.embedder!.embed(chunk.text),
          }));
          evalOptions.corpusHash = computeCorpusHash(chunks);
          evalOptions.graphDictionary = ["alpha", "beta", "gamma", "delta", "retrieval", "ranking", "lexical", "citations"];
          evalOptions.prebuiltGraph = buildGraphIndex(chunks, {
            corpusHash: evalOptions.corpusHash,
            dictionary: evalOptions.graphDictionary,
          });
        }

        const result = evaluateRagScenarios(scenarios, chunks, evalOptions);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "rag_stats": {
        const { corpus_dir = "fixtures/corpus" } = args as { corpus_dir?: string };
        const documents = await loadCorpusDocuments(corpus_dir);
        const chunks = chunkDocuments(documents, { maxCharacters: 256 });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                documents: documents.length,
                chunks: chunks.length,
                corpus_dir,
                total_chars: documents.reduce((sum, d) => sum + d.text.length, 0),
              }, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("engram-rag MCP server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});