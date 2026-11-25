import { Worker } from "bullmq";
import IORedis from "ioredis";
import {
  QUEUE_JOB_NAMES,
  type IndexRepoJob,
} from "@repolens/shared";
import { createDb } from "./db/client";
import { OpenAiEmbedder } from "./embed/openai-embedder";
import { handleIndexRepo } from "./jobs/index-repo";

async function main() {
  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const db = createDb();
  const embedder = new OpenAiEmbedder();

  const worker = new Worker(
    "repolens",
    async (job) => {
      if (job.name !== QUEUE_JOB_NAMES.INDEX_REPO) {
        console.warn(`Unknown job ${job.name}`);
        return;
      }
      const payload = job.data as IndexRepoJob;
      console.log(`Indexing repo ${payload.repoId}`);
      await handleIndexRepo(db, embedder, payload);
      console.log(`Done indexing ${payload.repoId}`);
    },
    {
      connection,
      concurrency: 1,
    },
  );

  worker.on("failed", (job, err) => {
    console.error(`Job ${job?.id} failed:`, err.message);
  });

  console.log("Worker listening for index-repo jobs");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
