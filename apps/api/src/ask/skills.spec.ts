import { describe, expect, it } from "vitest";
import { ASK_SYSTEM_PROMPT } from "./prompt";
import { buildAskSystemPrompt, loadSkill } from "./skills";

describe("skills", () => {
  it("loads ask-core.md", () => {
    const skill = loadSkill("ask-core.md");
    expect(skill.toLowerCase()).toContain("citations");
    expect(skill.toLowerCase()).toContain("abstain");
  });

  it("composes system prompt with core skill", () => {
    const system = buildAskSystemPrompt();
    expect(system.startsWith(ASK_SYSTEM_PROMPT)).toBe(true);
    expect(system).toContain("Never invent files");
    expect(system.length).toBeGreaterThan(ASK_SYSTEM_PROMPT.length);
  });
});
