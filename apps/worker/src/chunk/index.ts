import { readFileSync } from "fs";
import { join } from "path";
import { detectLanguage } from "./language";
import { chunkFile } from "./tree-sitter-chunker";
import type { CodeChunkDraft } from "./types";

export * from "./types";
export * from "./language";
export * from "./fallback";
export * from "./tree-sitter-chunker";

export function chunkRepositoryFiles(
  rootDir: string,
  relativePaths: string[],
): CodeChunkDraft[] {
  const all: CodeChunkDraft[] = [];
  for (const rel of relativePaths) {
    const abs = join(rootDir, rel);
    let source: string;
    try {
      source = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    // skip if null bytes slipped through
    if (source.includes("\u0000")) continue;

    const language = detectLanguage(rel);
    const chunks = chunkFile(rel, language, source);
    all.push(...chunks);
  }
  return all;
}
