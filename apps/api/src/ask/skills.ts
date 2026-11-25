import { readFileSync } from "fs";
import { join } from "path";
import { ASK_SYSTEM_PROMPT } from "./prompt";

const CORE_SKILL = "ask-core.md";

function resolveSkillPath(name: string): string {
  const candidates = [
    join(__dirname, "skills", name),
    join(__dirname, "..", "ask", "skills", name),
    join(process.cwd(), "src", "ask", "skills", name),
    join(process.cwd(), "apps", "api", "src", "ask", "skills", name),
  ];
  for (const path of candidates) {
    try {
      readFileSync(path, "utf8");
      return path;
    } catch {
      // try next
    }
  }
  throw new Error(`Skill file not found: ${name}`);
}

export function loadSkill(name: string): string {
  return readFileSync(resolveSkillPath(name), "utf8").trim();
}

export function buildAskSystemPrompt(): string {
  const skill = loadSkill(CORE_SKILL);
  return `${ASK_SYSTEM_PROMPT}\n\n${skill}`;
}
