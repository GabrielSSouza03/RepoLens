import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  collectSourceFiles,
  isSecretOrCredentialFile,
  shouldIndexRelativePath,
  shouldSkipHidden,
} from "./clone-repo";

describe("clone ignore filters", () => {
  it("skips hidden paths except .env.example and .github/workflows", () => {
    expect(shouldSkipHidden(".git")).toBe(true);
    expect(shouldSkipHidden(".vscode/settings.json")).toBe(true);
    expect(shouldSkipHidden("src/.hidden/file.ts")).toBe(true);
    expect(shouldSkipHidden(".env.example")).toBe(false);
    expect(shouldSkipHidden(".github/workflows/ci.yml")).toBe(false);
    expect(shouldSkipHidden(".github/ISSUE_TEMPLATE/bug.md")).toBe(true);
  });

  it("never indexes .env, .env.*, keys, or certs", () => {
    expect(isSecretOrCredentialFile(".env")).toBe(true);
    expect(isSecretOrCredentialFile(".env.local")).toBe(true);
    expect(isSecretOrCredentialFile(".env.production")).toBe(true);
    expect(isSecretOrCredentialFile(".env.example")).toBe(false);
    expect(isSecretOrCredentialFile("server.pem")).toBe(true);
    expect(isSecretOrCredentialFile("id_rsa")).toBe(true);
    expect(shouldIndexRelativePath(".env")).toBe(false);
    expect(shouldIndexRelativePath(".env.local")).toBe(false);
    expect(shouldIndexRelativePath("certs/app.key")).toBe(false);
  });

  it("honors .gitignore plus fixed ignore list", () => {
    const root = mkdtempSync(join(tmpdir(), "repolens-ignore-"));
    try {
      writeFileSync(join(root, ".gitignore"), "secret-dir/\n*.tmp\n");
      mkdirSync(join(root, "secret-dir"));
      writeFileSync(join(root, "secret-dir", "x.ts"), "export const x = 1;\n");
      writeFileSync(join(root, "keep.ts"), "export const keep = 1;\n");
      writeFileSync(join(root, "skip.tmp"), "tmp\n");
      writeFileSync(join(root, ".env"), "SECRET=1\n");
      writeFileSync(join(root, ".env.example"), "SECRET=\n");
      mkdirSync(join(root, "node_modules", "pkg"), { recursive: true });
      writeFileSync(join(root, "node_modules", "pkg", "index.js"), "module.exports=1;\n");
      mkdirSync(join(root, ".github", "workflows"), { recursive: true });
      writeFileSync(
        join(root, ".github", "workflows", "ci.yml"),
        "name: ci\n",
      );

      const { files } = collectSourceFiles(root);
      expect(files).toContain("keep.ts");
      expect(files).toContain(".env.example");
      expect(files).toContain(".github/workflows/ci.yml");
      expect(files).not.toContain("secret-dir/x.ts");
      expect(files).not.toContain("skip.tmp");
      expect(files).not.toContain(".env");
      expect(files).not.toContain("node_modules/pkg/index.js");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
