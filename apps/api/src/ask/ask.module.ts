import { Module } from "@nestjs/common";
import { AskController } from "./ask.controller";
import { AskService } from "./ask.service";
import { OpenAiService } from "./openai.service";

@Module({
  controllers: [AskController],
  providers: [AskService, OpenAiService],
})
export class AskModule {}
