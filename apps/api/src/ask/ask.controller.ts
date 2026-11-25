import { Body, Controller, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { AskDto } from "./dto/ask.dto";
import { AskService } from "./ask.service";

@Controller("repos")
export class AskController {
  constructor(private readonly askService: AskService) {}

  @Post(":id/ask")
  ask(@Param("id", ParseUUIDPipe) id: string, @Body() body: AskDto) {
    return this.askService.ask(id, body.question);
  }
}
