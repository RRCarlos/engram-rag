import {
  type DocumentChunk,
  type RagDocument,
  parseDocumentChunk,
} from "../contracts/rag.js";

export type ChunkOptions = {
  /** Chunk size in tokens (takes precedence over maxCharacters) */
  chunkSize?: number;
  /** Token overlap between adjacent chunks (must be < chunkSize) */
  chunkOverlap?: number;
  /** Legacy: maximum characters per chunk (kept for backwards compatibility) */
  maxCharacters?: number;
};

type TokenSpan = {
  text: string;
  start: number;
  end: number;
};

const DEFAULT_CHUNK_SIZE = 256;
const DEFAULT_CHUNK_OVERLAP = 50;
const DEFAULT_MAX_CHARACTERS = 320;

export function chunkDocuments(
  documents: RagDocument[],
  options: ChunkOptions = {},
): DocumentChunk[] {
  // Validate options
  if (options.chunkOverlap !== undefined && options.chunkSize !== undefined) {
    if (options.chunkOverlap >= options.chunkSize) {
      throw new Error("chunkOverlap must be less than chunkSize");
    }
  }

  // Token-based chunking takes precedence
  if (options.chunkSize !== undefined) {
    const chunkSize = options.chunkSize;
    const chunkOverlap = options.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP;
    return documents.flatMap((document) =>
      chunkDocumentTokens(document, chunkSize, chunkOverlap),
    );
  }

  // Legacy character-based chunking
  const maxCharacters = options.maxCharacters ?? DEFAULT_MAX_CHARACTERS;
  return documents.flatMap((document) => chunkDocumentChars(document, maxCharacters));
}

function chunkDocumentTokens(
  document: RagDocument,
  chunkSize: number,
  chunkOverlap: number,
): DocumentChunk[] {
  const tokens = tokenizeWithSpans(document.text);
  const chunks: DocumentChunk[] = [];
  let start = 0;
  let chunkIndex = 0;

  while (start < tokens.length) {
    const end = Math.min(start + chunkSize, tokens.length);
    const chunkTokens = tokens.slice(start, end);

    if (chunkTokens.length === 0) break;

    chunks.push(createChunkFromTokens(document, chunkTokens, chunkIndex, start));

    chunkIndex += 1;
    // Move start by chunkSize - chunkOverlap (advance with overlap)
    start += chunkSize - chunkOverlap;
  }

  return chunks;
}

function chunkDocumentChars(document: RagDocument, maxCharacters: number): DocumentChunk[] {
  const spans = wordSpans(document.text);
  const chunks: DocumentChunk[] = [];
  let current: typeof spans = [];

  for (const span of spans) {
    const nextLength = current.length === 0
      ? span.text.length
      : textForSpans(current).length + 1 + span.text.length;

    if (current.length > 0 && nextLength > maxCharacters) {
      chunks.push(createChunk(document, current, chunks.length));
      current = [];
    }

    current.push(span);
  }

  if (current.length > 0) {
    chunks.push(createChunk(document, current, chunks.length));
  }

  return chunks;
}

function tokenizeWithSpans(text: string): TokenSpan[] {
  // Tokenize on word boundaries, keeping track of original character positions
  const tokens: TokenSpan[] = [];
  const regex = /\w+/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    tokens.push({
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return tokens;
}

function createChunkFromTokens(
  document: RagDocument,
  tokens: TokenSpan[],
  chunkIndex: number,
  tokenStart: number,
): DocumentChunk {
  if (tokens.length === 0) {
    throw new Error("cannot create an empty document chunk");
  }

  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  if (!first || !last) {
    throw new Error("cannot create an empty document chunk");
  }
  const chunkText = tokens.map((t) => t.text).join(" ");

  return parseDocumentChunk({
    id: `${document.id}#chunk-${String(chunkIndex + 1).padStart(4, "0")}`,
    document_id: document.id,
    title: document.title,
    source_path: document.source_path,
    chunk_index: chunkIndex,
    text: chunkText,
    citation: {
      document_id: document.id,
      title: document.title,
      source_path: document.source_path,
      start_offset: first.start,
      end_offset: last.end,
      start_line: lineForOffset(document.text, first.start),
      end_line: lineForOffset(document.text, last.end),
    },
  });
}

function wordSpans(text: string): { text: string; start: number; end: number }[] {
  return Array.from(text.matchAll(/\S+/g), (match) => {
    const word = match[0];
    const start = match.index ?? 0;
    return { text: word, start, end: start + word.length };
  });
}

function createChunk(
  document: RagDocument,
  spans: { text: string; start: number; end: number }[],
  chunkIndex: number,
): DocumentChunk {
  const first = spans[0];
  const last = spans.at(-1);
  if (!first || !last) {
    throw new Error("cannot create an empty document chunk");
  }

  return parseDocumentChunk({
    id: `${document.id}#chunk-${String(chunkIndex + 1).padStart(4, "0")}`,
    document_id: document.id,
    title: document.title,
    source_path: document.source_path,
    chunk_index: chunkIndex,
    text: textForSpans(spans),
    citation: {
      document_id: document.id,
      title: document.title,
      source_path: document.source_path,
      start_offset: first.start,
      end_offset: last.end,
      start_line: lineForOffset(document.text, first.start),
      end_line: lineForOffset(document.text, last.end),
    },
  });
}

function textForSpans(spans: { text: string; start: number; end: number }[]): string {
  return spans.map((span) => span.text).join(" ");
}

function lineForOffset(text: string, offset: number): number {
  return text.slice(0, offset).split("\n").length;
}
