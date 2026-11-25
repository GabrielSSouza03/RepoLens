/**
 * Local eval harness for RepoLens ask quality.
 *
 * Env:
 *   EVAL_REPO_ID   — indexed passport (or target) repo UUID
 *   API_URL        — default http://localhost:3001
 *   EVAL_GOLDEN    — path to golden JSON (optional)
 *
 * Metrics:
 *   hit@K              — expectPaths prefix matches a retrieved citation path
 *   citationValidity   — prose path:start-end refs ⊆ retrieved citation keys
 *   abstainRate        — expectAbstain cases that abstain in answer text
 */
import { readFileSync } from "fs";
import { join } from "path";

interface GoldenCase {
  id: string;
  question: string;
  expectPaths: string[];
  expectAbstain: boolean;
}

interface AskResponse {
  answer: string;
  citations: Array<{
    filePath: string;
    startLine: number;
    endLine: number;
  }>;
}

const CITATION_REF_RE =
  /\b([A-Za-z0-9_./@+-]+?\.[A-Za-z0-9]+):(\d+)-(\d+)\b/g;

const ABSTAIN_RE =
  /n[aã]o (sei|encontrei|encontrou|há|ha)|insuficiente|não encontrei|nao encontrei/i;

function loadGolden(): GoldenCase[] {
  const custom = process.env.EVAL_GOLDEN;
  const path =
    custom ??
    join(__dirname, "..", "evals", "passport-golden.json");
  return JSON.parse(readFileSync(path, "utf8")) as GoldenCase[];
}

function pathHit(
  expectPaths: string[],
  citations: AskResponse["citations"],
): boolean {
  if (expectPaths.length === 0) {
    return true;
  }
  return expectPaths.some((expected) =>
    citations.some(
      (c) =>
        c.filePath === expected ||
        c.filePath.startsWith(expected.replace(/\/?$/, "/")) ||
        c.filePath.startsWith(expected),
    ),
  );
}

function citationValidity(answer: string, citations: AskResponse["citations"]): {
  total: number;
  valid: number;
} {
  const allowed = new Set(
    citations.map((c) => `${c.filePath}:${c.startLine}-${c.endLine}`),
  );
  let total = 0;
  let valid = 0;
  for (const match of answer.matchAll(CITATION_REF_RE)) {
    total += 1;
    const key = `${match[1]}:${match[2]}-${match[3]}`;
    if (allowed.has(key)) {
      valid += 1;
    }
  }
  return { total, valid };
}

async function ask(
  apiUrl: string,
  repoId: string,
  question: string,
): Promise<AskResponse> {
  const res = await fetch(`${apiUrl}/repos/${repoId}/ask`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ask failed ${res.status}: ${body}`);
  }
  return (await res.json()) as AskResponse;
}

async function main() {
  const repoId = process.env.EVAL_REPO_ID;
  if (!repoId) {
    console.error("Set EVAL_REPO_ID to an indexed repo UUID");
    process.exit(1);
  }
  const apiUrl = (process.env.API_URL ?? "http://localhost:3001").replace(
    /\/$/,
    "",
  );
  const cases = loadGolden();

  let hitDenom = 0;
  let hitNumer = 0;
  let citeTotal = 0;
  let citeValid = 0;
  let abstainDenom = 0;
  let abstainNumer = 0;

  for (const c of cases) {
    process.stdout.write(`- ${c.id}... `);
    try {
      const result = await ask(apiUrl, repoId, c.question);

      if (c.expectPaths.length > 0) {
        hitDenom += 1;
        if (pathHit(c.expectPaths, result.citations)) {
          hitNumer += 1;
        }
      }

      const cv = citationValidity(result.answer, result.citations);
      citeTotal += cv.total;
      citeValid += cv.valid;

      if (c.expectAbstain) {
        abstainDenom += 1;
        if (ABSTAIN_RE.test(result.answer) || result.citations.length === 0) {
          abstainNumer += 1;
        }
      }

      console.log("ok");
    } catch (err) {
      console.log("FAIL");
      console.error(err);
    }
  }

  const hitAtK = hitDenom === 0 ? 1 : hitNumer / hitDenom;
  const citationValidityRate = citeTotal === 0 ? 1 : citeValid / citeTotal;
  const abstainRate = abstainDenom === 0 ? 1 : abstainNumer / abstainDenom;

  console.log("\n=== Eval metrics ===");
  console.log(`cases: ${cases.length}`);
  console.log(`hit@K: ${hitAtK.toFixed(3)} (${hitNumer}/${hitDenom})`);
  console.log(
    `citationValidity: ${citationValidityRate.toFixed(3)} (${citeValid}/${citeTotal})`,
  );
  console.log(
    `abstainRate: ${abstainRate.toFixed(3)} (${abstainNumer}/${abstainDenom})`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
