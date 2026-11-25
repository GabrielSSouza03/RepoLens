import { describe, expect, it } from "vitest";
import {
  ASK_SYSTEM_PROMPT,
  buildAskUserPrompt,
  chunksToCitations,
} from "./prompt";

describe("prompt", () => {
  const chunks = [
    {
      filePath: "src/auth.ts",
      startLine: 10,
      endLine: 40,
      symbolName: "login",
      content: "function login() { return true; }",
    },
    {
      filePath: "lib/session.py",
      startLine: 1,
      endLine: 20,
      symbolName: null,
      content: "def get_session():\n  pass",
    },
  ];

  it("includes citation markers and question", () => {
    const prompt = buildAskUserPrompt("onde é feita a autenticação?", chunks);
    expect(prompt).toContain("Pergunta: onde é feita a autenticação?");
    expect(prompt).toContain("[src/auth.ts:10-40] login");
    expect(prompt).toContain("[lib/session.py:1-20]");
    expect(prompt).toContain("function login()");
  });

  it("maps chunks to citations with truncated excerpt", () => {
    const long = "x".repeat(500);
    const citations = chunksToCitations([
      { ...chunks[0], content: long },
    ]);
    expect(citations[0].excerpt.endsWith("…")).toBe(true);
    expect(citations[0].filePath).toBe("src/auth.ts");
    expect(citations[0].startLine).toBe(10);
  });

  it("system prompt requires citations", () => {
    expect(ASK_SYSTEM_PROMPT).toContain("path:start-end");
    expect(ASK_SYSTEM_PROMPT.toLowerCase()).toContain("não sabe");
  });
});
