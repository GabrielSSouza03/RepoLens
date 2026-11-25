import type { CitationDto } from "@repolens/shared";

export interface PromptChunk {
  filePath: string;
  startLine: number;
  endLine: number;
  symbolName: string | null;
  content: string;
}

export const ASK_SYSTEM_PROMPT = `Você é um assistente de onboarding de código.
Responda APENAS com base nos trechos fornecidos.
Toda afirmação factual deve citar no formato path:start-end (exemplo: src/auth.ts:10-40).
Se o contexto for insuficiente, diga claramente que não sabe ou não encontrou no código indexado.
Não invente arquivos, linhas ou símbolos.`;

export function buildAskUserPrompt(
  question: string,
  chunks: PromptChunk[],
): string {
  const parts = chunks.map((chunk) => {
    const symbol = chunk.symbolName ? ` ${chunk.symbolName}` : "";
    return `---\n[${chunk.filePath}:${chunk.startLine}-${chunk.endLine}]${symbol}\n${chunk.content}`;
  });

  return `Pergunta: ${question}\n\nTrechos:\n${parts.join("\n")}\n---`;
}

export function chunksToCitations(chunks: PromptChunk[]): CitationDto[] {
  return chunks.map((chunk) => ({
    filePath: chunk.filePath,
    startLine: chunk.startLine,
    endLine: chunk.endLine,
    symbolName: chunk.symbolName,
    excerpt:
      chunk.content.length > 400
        ? `${chunk.content.slice(0, 400)}…`
        : chunk.content,
  }));
}
