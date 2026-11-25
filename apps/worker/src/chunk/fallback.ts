import type { CodeChunkDraft, CodeLanguage } from "./types";

const DEFAULT_LINES = 80;
const DEFAULT_OVERLAP = 10;
const MIN_CHARS = 20;
const MAX_CHARS = 12_000;

export function chunkByLines(
  filePath: string,
  language: CodeLanguage,
  source: string,
  options?: { linesPerChunk?: number; overlap?: number },
): CodeChunkDraft[] {
  const linesPerChunk = options?.linesPerChunk ?? DEFAULT_LINES;
  const overlap = options?.overlap ?? DEFAULT_OVERLAP;
  const lines = source.split(/\r?\n/);
  if (lines.length === 0) return [];

  const chunks: CodeChunkDraft[] = [];
  let start = 0;

  while (start < lines.length) {
    const end = Math.min(start + linesPerChunk, lines.length);
    const content = truncate(lines.slice(start, end).join("\n"));
    if (content.trim().length >= MIN_CHARS) {
      chunks.push({
        filePath,
        language,
        symbolName: null,
        startLine: start + 1,
        endLine: end,
        content,
      });
    }
    if (end >= lines.length) break;
    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}

export function truncate(content: string): string {
  if (content.length <= MAX_CHARS) return content;
  return `${content.slice(0, MAX_CHARS)}\n/* truncated */`;
}

export { MIN_CHARS, MAX_CHARS };
