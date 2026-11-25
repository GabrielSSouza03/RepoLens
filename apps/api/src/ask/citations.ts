import type { CitationDto } from "@repolens/shared";
import { chunksToCitations, type PromptChunk } from "./prompt";

/** Matches `path:start-end` citation markers in model prose. */
export const CITATION_REF_RE =
  /\b([A-Za-z0-9_./@+-]+?\.[A-Za-z0-9]+):(\d+)-(\d+)\b/g;

export function chunkCitationKey(chunk: PromptChunk): string {
  return `${chunk.filePath}:${chunk.startLine}-${chunk.endLine}`;
}

export function chunkCitationKeys(chunks: PromptChunk[]): Set<string> {
  return new Set(chunks.map(chunkCitationKey));
}

export function extractCitationRefs(text: string): string[] {
  const refs: string[] = [];
  for (const match of text.matchAll(CITATION_REF_RE)) {
    refs.push(`${match[1]}:${match[2]}-${match[3]}`);
  }
  return refs;
}

/**
 * Remove path:start-end markers that are not in the retrieved chunk set.
 */
export function sanitizeAnswerCitations(
  answer: string,
  chunks: PromptChunk[],
): { answer: string; stripped: string[] } {
  const allowed = chunkCitationKeys(chunks);
  const stripped: string[] = [];

  const cleaned = answer.replace(CITATION_REF_RE, (full, path, start, end) => {
    const key = `${path}:${start}-${end}`;
    if (allowed.has(key)) {
      return full;
    }
    stripped.push(key);
    return "";
  });

  return {
    answer: cleaned.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim(),
    stripped,
  };
}

/**
 * Citations that appear in the sanitized answer, first-seen order.
 * Empty if the answer cites nothing valid.
 */
export function citationsCitedInAnswer(
  answer: string,
  chunks: PromptChunk[],
): CitationDto[] {
  const byKey = new Map(chunks.map((c) => [chunkCitationKey(c), c]));
  const seen = new Set<string>();
  const ordered: PromptChunk[] = [];

  for (const ref of extractCitationRefs(answer)) {
    if (seen.has(ref)) continue;
    seen.add(ref);
    const chunk = byKey.get(ref);
    if (chunk) ordered.push(chunk);
  }

  return chunksToCitations(ordered);
}
