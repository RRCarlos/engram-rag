import {
  type DocumentChunk,
  type RagDocument,
  parseDocumentChunk,
} from "../contracts/rag.js";

export type ChunkOptions = {
  maxCharacters?: number;
};

type WordSpan = {
  text: string;
  start: number;
  end: number;
};

const DEFAULT_MAX_CHARACTERS = 320;

export function chunkDocuments(
  documents: RagDocument[],
  options: ChunkOptions = {},
): DocumentChunk[] {
  const maxCharacters = options.maxCharacters ?? DEFAULT_MAX_CHARACTERS;

  return documents.flatMap((document) => chunkDocument(document, maxCharacters));
}

function chunkDocument(document: RagDocument, maxCharacters: number): DocumentChunk[] {
  const spans = wordSpans(document.text);
  const chunks: DocumentChunk[] = [];
  let current: WordSpan[] = [];

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

function wordSpans(text: string): WordSpan[] {
  return Array.from(text.matchAll(/\S+/g), (match) => {
    const word = match[0];
    const start = match.index;
    return { text: word, start, end: start + word.length };
  });
}

function createChunk(
  document: RagDocument,
  spans: WordSpan[],
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

function textForSpans(spans: WordSpan[]): string {
  return spans.map((span) => span.text).join(" ");
}

function lineForOffset(text: string, offset: number): number {
  return text.slice(0, offset).split("\n").length;
}
