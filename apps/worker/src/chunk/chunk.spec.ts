import { describe, expect, it } from "vitest";
import { chunkByLines } from "./fallback";
import { detectLanguage } from "./language";
import { chunkFile } from "./tree-sitter-chunker";

describe("detectLanguage", () => {
  it("maps extensions", () => {
    expect(detectLanguage("a.ts")).toBe("typescript");
    expect(detectLanguage("a.tsx")).toBe("typescript");
    expect(detectLanguage("a.js")).toBe("javascript");
    expect(detectLanguage("a.py")).toBe("python");
    expect(detectLanguage("a.md")).toBe("unknown");
  });
});

describe("chunkByLines", () => {
  it("creates overlapping blocks with null symbol", () => {
    const source = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join(
      "\n",
    );
    const chunks = chunkByLines("file.txt", "unknown", source, {
      linesPerChunk: 40,
      overlap: 10,
    });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].symbolName).toBeNull();
    expect(chunks[0].startLine).toBe(1);
    expect(chunks[0].endLine).toBe(40);
  });
});

describe("chunkFile tree-sitter", () => {
  it("extracts TS function and class", () => {
    const source = `
export function authenticate(user: string) {
  return user === "admin";
}

export class AuthService {
  login() {
    return authenticate("admin");
  }
}
`;
    const chunks = chunkFile("src/auth.ts", "typescript", source);
    const names = chunks.map((c) => c.symbolName).filter(Boolean);
    expect(names).toEqual(expect.arrayContaining(["authenticate", "AuthService"]));
    expect(chunks.every((c) => c.startLine >= 1 && c.endLine >= c.startLine)).toBe(
      true,
    );
  });

  it("extracts Python defs", () => {
    const source = `
def login(user):
    return True

class Auth:
    def check(self):
        return login("x")
`;
    const chunks = chunkFile("auth.py", "python", source);
    const names = chunks.map((c) => c.symbolName).filter(Boolean);
    expect(names).toEqual(expect.arrayContaining(["login", "Auth", "check"]));
  });

  it("falls back for unknown language", () => {
    const source = Array.from({ length: 30 }, (_, i) => `line content ${i}`).join(
      "\n",
    );
    const chunks = chunkFile("notes.txt", "unknown", source);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0].symbolName).toBeNull();
  });
});
