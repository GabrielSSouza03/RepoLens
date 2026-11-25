import { describe, expect, it, vi } from "vitest";
import {
  citationsCitedInAnswer,
  sanitizeAnswerCitations,
} from "./citations";
import {
  buildAskUserPrompt,
  chunksToCitations,
  type PromptChunk,
} from "./prompt";
import { buildAskSystemPrompt } from "./skills";

/**
 * Integration-style test of the ask flow without live OpenAI/DB:
 * retrieve (mocked) → skills + prompt → chat (mocked) → sanitize → citations.
 */
describe("ask flow integration", () => {
  it("returns answer and only citations present in the answer", async () => {
    const chunks: PromptChunk[] = [
      {
        filePath: "lib/middleware/authenticate.js",
        startLine: 12,
        endLine: 48,
        symbolName: "authenticate",
        content:
          "exports.authenticate = function(strategy, options, callback) {\n  // passport auth entry\n};",
      },
      {
        filePath: "lib/index.js",
        startLine: 1,
        endLine: 5,
        symbolName: null,
        content: "module.exports = require('./middleware/authenticate');",
      },
    ];

    const embed = vi.fn(async () => Array(768).fill(0.01));
    const chat = vi.fn(async (system: string, user: string) => {
      expect(system).toContain("path:start-end");
      expect(system).toContain("Never invent files");
      expect(user).toContain("lib/middleware/authenticate.js:12-48");
      return "A autenticação ocorre em lib/middleware/authenticate.js:12-48 via `authenticate`. Also see src/invented.ts:1-2.";
    });

    const question = "onde é feita a autenticação?";
    await embed(question);
    const systemPrompt = buildAskSystemPrompt();
    const userPrompt = buildAskUserPrompt(question, chunks);
    const raw = await chat(systemPrompt, userPrompt);
    const { answer, stripped } = sanitizeAnswerCitations(raw, chunks);
    const citations = citationsCitedInAnswer(answer, chunks);
    const retrievedCitations = chunksToCitations(chunks);

    expect(embed).toHaveBeenCalledOnce();
    expect(chat).toHaveBeenCalledOnce();
    expect(answer.toLowerCase()).toContain("authenticate");
    expect(answer).not.toContain("src/invented.ts:1-2");
    expect(stripped).toEqual(["src/invented.ts:1-2"]);
    expect(citations).toHaveLength(1);
    expect(citations[0]).toMatchObject({
      filePath: "lib/middleware/authenticate.js",
      startLine: 12,
      endLine: 48,
      symbolName: "authenticate",
    });
    expect(retrievedCitations).toHaveLength(2);
  });
});

