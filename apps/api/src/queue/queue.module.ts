import { Global, Module } from "@nestjs/common";
import { JOB_QUEUE } from "./queue.tokens";
import { BullMqJobQueue } from "./bullmq-job-queue";

@Global()
@Module({
  providers: [
    {
      provide: JOB_QUEUE,
      useFactory: () => new BullMqJobQueue(),
    },
  ],
  exports: [JOB_QUEUE],
})
export class QueueModule {}
