export * from "./schema";
export * from "./llm";

export const REPO_STATUSES = [
  "pending",
  "indexing",
  "ready",
  "error",
] as const;

export type RepoStatus = (typeof REPO_STATUSES)[number];

export const QUEUE_JOB_NAMES = {
  INDEX_REPO: "index-repo",
} as const;

export type QueueJobName =
  (typeof QUEUE_JOB_NAMES)[keyof typeof QUEUE_JOB_NAMES];

export interface IndexRepoJob {
  repoId: string;
}

export interface JobQueue {
  enqueue<T>(name: string, payload: T): Promise<void>;
}

export interface RepoDto {
  id: string;
  url: string;
  owner: string;
  name: string;
  status: RepoStatus;
  progress: number;
  errorMessage: string | null;
}

export interface CreateRepoResponse {
  id: string;
  status: RepoStatus;
  progress: number;
}

export interface CitationDto {
  filePath: string;
  startLine: number;
  endLine: number;
  symbolName: string | null;
  excerpt: string;
}

export interface AskResponseDto {
  answer: string;
  /** Chunks whose path:start-end appear in the sanitized answer, citation order. */
  citations: CitationDto[];
  /** Full retrieve top-K for debug UI. */
  retrievedCitations?: CitationDto[];
}

export interface CreateRepoBody {
  url: string;
}

export interface AskBody {
  question: string;
}

export const GITHUB_URL_REGEX =
  /^https:\/\/github\.com\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/;

const GITHUB_SEGMENT_RE = /^[A-Za-z0-9._-]+$/;

/** Reject ".", "..", empty, or chars outside [A-Za-z0-9._-]. */
export function isValidGitHubSegment(segment: string): boolean {
  if (!segment || segment === "." || segment === "..") {
    return false;
  }
  return GITHUB_SEGMENT_RE.test(segment);
}

export function parseGitHubUrl(url: string): {
  owner: string;
  name: string;
  cloneUrl: string;
} | null {
  const match = url.trim().match(GITHUB_URL_REGEX);
  if (!match) {
    return null;
  }
  const owner = match[1];
  const name = match[2];
  if (!isValidGitHubSegment(owner) || !isValidGitHubSegment(name)) {
    return null;
  }
  return {
    owner,
    name,
    cloneUrl: `https://github.com/${owner}/${name}.git`,
  };
}
