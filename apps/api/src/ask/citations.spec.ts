import { describe, expect, it } from "vitest";
import {
  citationsCitedInAnswer,
  extractCitationRefs,
  sanitizeAnswerCitations,
} from "./citations";
import type { PromptChunk } from "./prompt";

describe("citations sanitize", () => {
  const chunks: PromptChunk[] = [
    {
      filePath: "lib/middleware/authenticate.js",
      startLine: 12,
      endLine: 48,
      symbolName: "authenticate",
      content: "exports.authenticate = function() {}",
    },
    {
      filePath: "lib/index.js",
      startLine: 1,
      endLine: 10,
      symbolName: null,
      content: "module.exports = {}",
    },
  ];

  it("keeps refs present in retrieved chunks", () => {
    const raw =
      "Auth happens in lib/middleware/authenticate.js:12-48 via authenticate.";
    const { answer, stripped } = sanitizeAnswerCitations(raw, chunks);
    expect(answer).toContain("lib/middleware/authenticate.js:12-48");
    expect(stripped).toHaveLength(0);
  });

  it("strips invented path:start-end refs", () => {
    const raw =
      "See src/fake.ts:1-9 and lib/middleware/authenticate.js:12-48.";
    const { answer, stripped } = sanitizeAnswerCitations(raw, chunks);
    expect(answer).not.toContain("src/fake.ts:1-9");
    expect(answer).toContain("lib/middleware/authenticate.js:12-48");
    expect(stripped).toEqual(["src/fake.ts:1-9"]);
  });

  it("extracts citation refs from prose", () => {
    const refs = extractCitationRefs(
      "A in a/b.ts:1-2 and c/d.js:10-20.",
    );
    expect(refs).toEqual(["a/b.ts:1-2", "c/d.js:10-20"]);
  });

  it("returns only citations that appear in the answer, in order", () => {
    const raw =
      "See lib/index.js:1-10 then lib/middleware/authenticate.js:12-48 and again lib/index.js:1-10.";
    const { answer } = sanitizeAnswerCitations(raw, chunks);
    const citations = citationsCitedInAnswer(answer, chunks);
    expect(citations.map((c) => `${c.filePath}:${c.startLine}-${c.endLine}`)).toEqual([
      "lib/index.js:1-10",
      "lib/middleware/authenticate.js:12-48",
    ]);
  });

  it("returns empty citations when answer cites nothing valid", () => {
    const raw = "Não encontrei evidência no código indexado.";
    const { answer } = sanitizeAnswerCitations(raw, chunks);
    expect(citationsCitedInAnswer(answer, chunks)).toEqual([]);
  });
});

