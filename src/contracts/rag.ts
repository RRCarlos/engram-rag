import { z } from "zod";
import type { ParseResult } from "./knowledgeRecord.js";

export const RagDocumentSchema = z
  .object({
    id: z.string().min(1, "id is required"),
    title: z.string().min(1, "title is required"),
    source_path: z.string().min(1, "source_path is required"),
    text: z.string().min(1, "text is required"),
  })
  .strict();

export const RagQuerySchema = z
  .object({
    text: z.string().min(1, "text is required"),
    top_k: z.number().int().positive("top_k must be positive"),
  })
  .strict();

export const CitationSchema = z
  .object({
    document_id: z.string().min(1, "document_id is required"),
    title: z.string().min(1, "title is required"),
    source_path: z.string().min(1, "source_path is required"),
    start_offset: z.number().int().nonnegative(),
    end_offset: z.number().int().positive(),
    start_line: z.number().int().positive(),
    end_line: z.number().int().positive(),
  })
  .strict();

export const DocumentChunkSchema = z
  .object({
    id: z.string().min(1, "id is required"),
    document_id: z.string().min(1, "document_id is required"),
    title: z.string().min(1, "title is required"),
    source_path: z.string().min(1, "source_path is required"),
    chunk_index: z.number().int().nonnegative(),
    text: z.string().min(1, "text is required"),
    citation: CitationSchema,
  })
  .strict();

export const RagRetrievalResultSchema = z
  .object({
    chunk_id: z.string().min(1, "chunk_id is required"),
    score: z.number().positive(),
    snippet: z.string().min(1, "snippet is required"),
    citation: CitationSchema,
  })
  .strict();

export const RagRetrievalResponseSchema = z
  .object({
    query: z.string().min(1, "query is required"),
    top_k: z.number().int().positive(),
    results: z.array(RagRetrievalResultSchema),
  })
  .strict();

export type RagDocument = z.infer<typeof RagDocumentSchema>;
export type RagQuery = z.infer<typeof RagQuerySchema>;
export type Citation = z.infer<typeof CitationSchema>;
export type DocumentChunk = z.infer<typeof DocumentChunkSchema>;
export type RagRetrievalResult = z.infer<typeof RagRetrievalResultSchema>;
export type RagRetrievalResponse = z.infer<typeof RagRetrievalResponseSchema>;

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
    .join("; ");
}

export function parseRagDocument(input: unknown): RagDocument {
  return RagDocumentSchema.parse(input);
}

export function safeParseRagDocument(input: unknown): ParseResult<RagDocument> {
  const result = RagDocumentSchema.safeParse(input);
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, error: formatZodError(result.error) };
}

export function parseRagQuery(input: unknown): RagQuery {
  return RagQuerySchema.parse(input);
}

export function safeParseRagQuery(input: unknown): ParseResult<RagQuery> {
  const result = RagQuerySchema.safeParse(input);
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, error: formatZodError(result.error) };
}

export function parseDocumentChunk(input: unknown): DocumentChunk {
  return DocumentChunkSchema.parse(input);
}

export function safeParseDocumentChunk(input: unknown): ParseResult<DocumentChunk> {
  const result = DocumentChunkSchema.safeParse(input);
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, error: formatZodError(result.error) };
}

export function parseRagRetrievalResponse(input: unknown): RagRetrievalResponse {
  return RagRetrievalResponseSchema.parse(input);
}

export function safeParseRagRetrievalResponse(
  input: unknown,
): ParseResult<RagRetrievalResponse> {
  const result = RagRetrievalResponseSchema.safeParse(input);
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, error: formatZodError(result.error) };
}
