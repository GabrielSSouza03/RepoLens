import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { DbModule } from "./db/db.module";
import { QueueModule } from "./queue/queue.module";
import { ReposModule } from "./repos/repos.module";
import { AskModule } from "./ask/ask.module";

@Module({
  imports: [DbModule, QueueModule, ReposModule, AskModule],
  controllers: [HealthController],
})
export class AppModule {}
