import { eq } from "drizzle-orm";
import {
  codeChunks,
  parseGitHubUrl,
  repositories,
  type IndexRepoJob,
} from "@repolens/shared";
import {
  cleanupRepo,
  cloneShallow,
  collectSourceFiles,
  isProbablyBinary,
} from "../clone/clone-repo";
import { chunkRepositoryFiles } from "../chunk";
import type { Database } from "../db/client";
import { OpenAiEmbedder } from "../embed/openai-embedder";
import { join } from "path";

async function setProgress(
  db: Database,
  repoId: string,
  progress: number,
  status: "indexing" | "ready" | "error" = "indexing",
  errorMessage?: string,
) {
  await db
    .update(repositories)
    .set({
      progress,
      status,
      errorMessage: errorMessage ?? null,
      updatedAt: new Date(),
    })
    .where(eq(repositories.id, repoId));
}

export async function handleIndexRepo(
  db: Database,
  embedder: OpenAiEmbedder,
  job: IndexRepoJob,
): Promise<void> {
  const { repoId } = job;

  const [repo] = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, repoId))
    .limit(1);

  if (!repo) {
    throw new Error(`Repository ${repoId} not found`);
  }

  const parsed = parseGitHubUrl(repo.url);
  if (!parsed) {
    await setProgress(db, repoId, 0, "error", "Invalid GitHub URL");
    return;
  }

  try {
    await setProgress(db, repoId, 5, "indexing");
    const rootDir = await cloneShallow(parsed.cloneUrl, repoId);

    await setProgress(db, repoId, 15, "indexing");
    const { files } = collectSourceFiles(rootDir);

    const filtered: string[] = [];
    for (const rel of files) {
      if (await isProbablyBinary(join(rootDir, rel))) continue;
      filtered.push(rel);
    }

    await setProgress(db, repoId, 25, "indexing");
    const drafts = chunkRepositoryFiles(rootDir, filtered);

    if (drafts.length === 0) {
      await setProgress(
        db,
        repoId,
        0,
        "error",
        "No indexable source files found",
      );
      cleanupRepo(repoId);
      return;
    }

    await setProgress(db, repoId, 70, "indexing");

    // replace previous chunks if re-indexed
    await db.delete(codeChunks).where(eq(codeChunks.repoId, repoId));

    const embeddings = await embedder.embedBatch(
      drafts.map((d) => d.content),
    );

    await setProgress(db, repoId, 90, "indexing");

    const insertBatchSize = 100;
    for (let i = 0; i < drafts.length; i += insertBatchSize) {
      const slice = drafts.slice(i, i + insertBatchSize);
      const embSlice = embeddings.slice(i, i + insertBatchSize);
      await db.insert(codeChunks).values(
        slice.map((draft, idx) => ({
          repoId,
          filePath: draft.filePath,
          language: draft.language,
          symbolName: draft.symbolName,
          startLine: draft.startLine,
          endLine: draft.endLine,
          content: draft.content,
          embedding: embSlice[idx],
        })),
      );

      const progress =
        90 + Math.floor(((i + slice.length) / drafts.length) * 8);
      await setProgress(db, repoId, Math.min(progress, 98), "indexing");
    }

    cleanupRepo(repoId);
    await setProgress(db, repoId, 100, "ready");
  } catch (err) {
    cleanupRepo(repoId);
    const message = err instanceof Error ? err.message : String(err);
    await setProgress(db, repoId, 0, "error", message.slice(0, 2000));
    throw err;
  }
}
