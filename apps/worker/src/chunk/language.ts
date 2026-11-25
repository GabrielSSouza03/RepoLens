import { extname } from "path";
import type { CodeLanguage } from "./types";

export function detectLanguage(filePath: string): CodeLanguage {
  const ext = extname(filePath).toLowerCase();
  switch (ext) {
    case ".ts":
    case ".tsx":
      return "typescript";
    case ".js":
    case ".jsx":
    case ".mjs":
    case ".cjs":
      return "javascript";
    case ".py":
      return "python";
    default:
      return "unknown";
  }
}

export function isIndexableLanguage(language: CodeLanguage): boolean {
  return language !== "unknown";
}
