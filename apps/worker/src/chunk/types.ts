export type CodeLanguage = "typescript" | "javascript" | "python" | "unknown";

export interface CodeChunkDraft {
  filePath: string;
  language: CodeLanguage;
  symbolName: string | null;
  startLine: number;
  endLine: number;
  content: string;
}
