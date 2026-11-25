import Parser, { Query, type Language } from "tree-sitter";
import JavaScript from "tree-sitter-javascript";
import Python from "tree-sitter-python";
import TypeScript from "tree-sitter-typescript";
import { chunkByLines, truncate, MIN_CHARS } from "./fallback";
import type { CodeChunkDraft, CodeLanguage } from "./types";

type LanguageModule = Language;

const TS_QUERY = `
(function_declaration name: (identifier) @name) @symbol
(class_declaration name: (type_identifier) @name) @symbol
(method_definition name: (property_identifier) @name) @symbol
(export_statement declaration: (function_declaration name: (identifier) @name) @symbol)
(export_statement declaration: (class_declaration name: (type_identifier) @name) @symbol)
(lexical_declaration (variable_declarator name: (identifier) @name value: (arrow_function)) @symbol)
(lexical_declaration (variable_declarator name: (identifier) @name value: (function_expression)) @symbol)
`;

const JS_QUERY = `
(function_declaration name: (identifier) @name) @symbol
(class_declaration name: (identifier) @name) @symbol
(method_definition name: (property_identifier) @name) @symbol
(export_statement declaration: (function_declaration name: (identifier) @name) @symbol)
(export_statement declaration: (class_declaration name: (identifier) @name) @symbol)
(lexical_declaration (variable_declarator name: (identifier) @name value: (arrow_function)) @symbol)
(lexical_declaration (variable_declarator name: (identifier) @name value: (function_expression)) @symbol)
`;

const PY_QUERY = `
(function_definition name: (identifier) @name) @symbol
(class_definition name: (identifier) @name) @symbol
`;

function getLanguage(language: CodeLanguage): LanguageModule | null {
  if (language === "typescript") {
    return (TypeScript as { typescript: LanguageModule }).typescript;
  }
  if (language === "javascript") {
    return JavaScript as unknown as LanguageModule;
  }
  if (language === "python") {
    return Python as unknown as LanguageModule;
  }
  return null;
}

function getQuerySource(language: CodeLanguage): string | null {
  if (language === "typescript") return TS_QUERY;
  if (language === "javascript") return JS_QUERY;
  if (language === "python") return PY_QUERY;
  return null;
}

export function chunkFile(
  filePath: string,
  language: CodeLanguage,
  source: string,
): CodeChunkDraft[] {
  if (language === "unknown") {
    return chunkByLines(filePath, language, source);
  }

  try {
    const lang = getLanguage(language);
    const querySource = getQuerySource(language);
    if (!lang || !querySource) {
      return chunkByLines(filePath, language, source);
    }

    const parser = new Parser();
    parser.setLanguage(lang);
    const tree = parser.parse(source);
    const query = new Query(lang, querySource);
    const matches = query.matches(tree.rootNode);

    const seen = new Set<string>();
    const chunks: CodeChunkDraft[] = [];

    for (const match of matches) {
      const symbolCapture = match.captures.find((c) => c.name === "symbol");
      const nameCapture = match.captures.find((c) => c.name === "name");
      if (!symbolCapture) continue;

      const node = symbolCapture.node;
      const startLine = node.startPosition.row + 1;
      const endLine = node.endPosition.row + 1;
      const key = `${startLine}:${endLine}:${nameCapture?.node.text ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const content = truncate(node.text);
      if (content.trim().length < MIN_CHARS) continue;

      // Oversized symbol → line fallback for that span only
      if (content.length >= 12_000 || endLine - startLine > 200) {
        const lines = source.split(/\r?\n/).slice(startLine - 1, endLine);
        chunks.push(
          ...chunkByLines(filePath, language, lines.join("\n")).map((c) => ({
            ...c,
            startLine: c.startLine + startLine - 1,
            endLine: c.endLine + startLine - 1,
            symbolName: nameCapture?.node.text ?? null,
          })),
        );
        continue;
      }

      chunks.push({
        filePath,
        language,
        symbolName: nameCapture?.node.text ?? null,
        startLine,
        endLine,
        content,
      });
    }

    if (chunks.length === 0) {
      return chunkByLines(filePath, language, source);
    }

    return chunks;
  } catch {
    return chunkByLines(filePath, language, source);
  }
}
