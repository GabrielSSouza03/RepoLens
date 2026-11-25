import { JobQueue } from "@repolens/shared";
import { Queue } from "bullmq";
import IORedis from "ioredis";

export class BullMqJobQueue implements JobQueue {
  private readonly queue: Queue;
  private readonly connection: IORedis;

  constructor(redisUrl?: string) {
    this.connection = new IORedis(
      redisUrl ?? process.env.REDIS_URL ?? "redis://localhost:6379",
      { maxRetriesPerRequest: null },
    );
    this.queue = new Queue("repolens", { connection: this.connection });
  }

  async enqueue<T>(name: string, payload: T): Promise<void> {
    await this.queue.add(name, payload, {
      removeOnComplete: 100,
      removeOnFail: 200,
      attempts: 2,
      backoff: { type: "exponential", delay: 3000 },
    });
  }

  async close(): Promise<void> {
    await this.queue.close();
    await this.connection.quit();
  }
}
