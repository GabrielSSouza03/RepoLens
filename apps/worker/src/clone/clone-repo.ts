import { spawn } from "child_process";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "fs";
import ignore from "ignore";
import { extname, join, relative, sep } from "path";

const IGNORE_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".git",
  ".next",
  ".turbo",
  "vendor",
  "__pycache__",
  ".venv",
  "venv",
  "bin",
  "obj",
]);

const IGNORE_FILES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "poetry.lock",
  "Cargo.lock",
  "composer.lock",
  "Gemfile.lock",
]);

const BINARY_EXTS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".svg",
  ".pdf",
  ".zip",
  ".gz",
  ".tar",
  ".bz2",
  ".7z",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".bin",
  ".wasm",
  ".mp3",
  ".mp4",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".class",
  ".jar",
  ".pyc",
  ".o",
  ".a",
]);

const KEY_OR_CERT_RE =
  /\.(pem|key|p12|pfx|crt|cer|der)$/i;
const SSH_KEY_RE = /^(id_rsa|id_dsa|id_ecdsa|id_ed25519)(\.pub)?$/i;

export interface CloneResult {
  rootDir: string;
  files: string[];
}

export function getRepoWorkDir(repoId: string): string {
  const base = process.env.REPOS_DATA_DIR ?? "/data/repos";
  return join(base, repoId);
}

export function getMaxRepoSizeBytes(): number {
  return Number(process.env.MAX_REPO_SIZE_BYTES ?? 50 * 1024 * 1024);
}

/** Directory size in bytes (files only). */
export function dirSizeBytes(dir: string): number {
  let total = 0;
  if (!existsSync(dir)) return 0;

  function walk(current: string) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        total += statSync(full).size;
      }
    }
  }

  walk(dir);
  return total;
}

/**
 * Hidden paths skipped by default. Allowed exceptions:
 * - `.env.example`
 * - `.github` / `.github/workflows/**` (only workflows under .github)
 * Never: `.env`, `.env.*` (except `.env.example`), keys, certs.
 */
export function isAllowedHiddenPath(relPath: string): boolean {
  const normalized = relPath.split(sep).join("/");
  if (normalized === ".env.example") return true;
  if (
    normalized === ".github" ||
    normalized === ".github/workflows" ||
    normalized.startsWith(".github/workflows/")
  ) {
    return true;
  }
  return false;
}

export function isSecretOrCredentialFile(fileName: string): boolean {
  if (fileName === ".env.example") return false;
  if (fileName === ".env" || fileName.startsWith(".env.")) return true;
  if (KEY_OR_CERT_RE.test(fileName)) return true;
  if (SSH_KEY_RE.test(fileName)) return true;
  return false;
}

/** True if path is hidden (or under .github outside workflows) and not allowlisted. */
export function shouldSkipHidden(relPath: string): boolean {
  const normalized = relPath.split(sep).join("/");
  if (isAllowedHiddenPath(normalized)) return false;
  if (normalized === ".github" || normalized.startsWith(".github/")) {
    return true;
  }
  return normalized.split("/").some((segment) => segment.startsWith("."));
}

export function loadRepoIgnore(rootDir: string) {
  const ig = ignore();
  const gitignorePath = join(rootDir, ".gitignore");
  if (existsSync(gitignorePath)) {
    ig.add(readFileSync(gitignorePath, "utf8"));
  }
  return ig;
}

export function shouldIndexRelativePath(
  relPath: string,
  options: {
    ig?: ReturnType<typeof ignore>;
    fileName?: string;
  } = {},
): boolean {
  const normalized = relPath.split(sep).join("/");
  const fileName =
    options.fileName ?? normalized.split("/").pop() ?? normalized;

  if (shouldSkipHidden(normalized)) return false;
  if (isSecretOrCredentialFile(fileName)) return false;

  const segments = normalized.split("/");
  for (const segment of segments.slice(0, -1)) {
    if (IGNORE_DIRS.has(segment)) return false;
  }
  if (IGNORE_DIRS.has(fileName)) return false;
  if (IGNORE_FILES.has(fileName)) return false;

  const ext = extname(fileName).toLowerCase();
  if (BINARY_EXTS.has(ext)) return false;

  if (options.ig?.ignores(normalized)) return false;

  return true;
}

export async function cloneShallow(
  cloneUrl: string,
  repoId: string,
): Promise<string> {
  const maxBytes = getMaxRepoSizeBytes();
  const rootDir = getRepoWorkDir(repoId);
  if (existsSync(rootDir)) {
    rmSync(rootDir, { recursive: true, force: true });
  }
  mkdirSync(rootDir, { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "git",
      [
        "clone",
        "--depth",
        "1",
        `--filter=blob:limit=${maxBytes}`,
        "--single-branch",
        cloneUrl,
        rootDir,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearInterval(poll);
      child.kill("SIGKILL");
      reject(err);
    };
    const ok = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearInterval(poll);
      resolve();
    };

    const timeout = setTimeout(() => {
      fail(new Error("git clone timed out after 120s"));
    }, 120_000);

    const poll = setInterval(() => {
      try {
        if (dirSizeBytes(rootDir) > maxBytes) {
          fail(
            new Error(
              `Repository exceeds MAX_REPO_SIZE_BYTES (${maxBytes}) during clone`,
            ),
          );
        }
      } catch {
        // ignore transient FS errors while git writes
      }
    }, 500);

    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => fail(err));
    child.on("close", (code, signal) => {
      if (settled) return;
      if (code === 0) {
        ok();
        return;
      }
      fail(
        new Error(
          `git clone failed (code=${code}, signal=${signal}): ${stderr.trim().slice(0, 500)}`,
        ),
      );
    });
  });

  const size = dirSizeBytes(rootDir);
  if (size > maxBytes) {
    rmSync(rootDir, { recursive: true, force: true });
    throw new Error(
      `Repository exceeds MAX_REPO_SIZE_BYTES (${maxBytes}); cloned size=${size}`,
    );
  }

  return rootDir;
}

export function cleanupRepo(repoId: string): void {
  const rootDir = getRepoWorkDir(repoId);
  if (existsSync(rootDir)) {
    rmSync(rootDir, { recursive: true, force: true });
  }
}

export function collectSourceFiles(rootDir: string): {
  files: string[];
  totalBytes: number;
} {
  const maxBytes = getMaxRepoSizeBytes();
  const maxFiles = Number(process.env.MAX_FILE_COUNT ?? 2000);
  const ig = loadRepoIgnore(rootDir);

  const files: string[] = [];
  let totalBytes = 0;

  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const rel = relative(rootDir, full).split(sep).join("/");

      if (entry.isDirectory()) {
        if (IGNORE_DIRS.has(entry.name)) continue;
        if (shouldSkipHidden(rel)) continue;
        if (ig.ignores(rel) || ig.ignores(`${rel}/`)) continue;
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;

      if (!shouldIndexRelativePath(rel, { ig, fileName: entry.name })) {
        continue;
      }

      const st = statSync(full);
      if (st.size === 0) continue;
      if (st.size > 512 * 1024) continue; // skip huge single files

      totalBytes += st.size;
      if (totalBytes > maxBytes) {
        throw new Error(
          `Repository exceeds MAX_REPO_SIZE_BYTES (${maxBytes})`,
        );
      }

      files.push(rel);
      if (files.length > maxFiles) {
        throw new Error(`Repository exceeds MAX_FILE_COUNT (${maxFiles})`);
      }
    }
  }

  walk(rootDir);
  return { files, totalBytes };
}

export async function isProbablyBinary(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const stream = createReadStream(filePath, { start: 0, end: 8000 });
    let isBin = false;
    stream.on("data", (chunk: string | Buffer) => {
      const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      if (buf.includes(0)) isBin = true;
    });
    stream.on("end", () => resolve(isBin));
    stream.on("error", () => resolve(true));
  });
}
