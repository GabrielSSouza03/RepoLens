import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AskResponseDto,
  askLogs,
  repositories,
  RepoStatus,
} from "@repolens/shared";
import { eq, sql } from "drizzle-orm";
import { DB, type Database } from "../db/client";
import {
  citationsCitedInAnswer,
  sanitizeAnswerCitations,
} from "./citations";
import { OpenAiService } from "./openai.service";
import {
  buildAskUserPrompt,
  chunksToCitations,
  type PromptChunk,
} from "./prompt";
import { buildAskSystemPrompt } from "./skills";

@Injectable()
export class AskService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly openai: OpenAiService,
  ) {}

  async ask(repoId: string, question: string): Promise<AskResponseDto> {
    const [repo] = await this.db
      .select()
      .from(repositories)
      .where(eq(repositories.id, repoId))
      .limit(1);

    if (!repo) {
      throw new NotFoundException(`Repository ${repoId} not found`);
    }

    if ((repo.status as RepoStatus) !== "ready") {
      throw new ConflictException(
        `Repository is not ready (status=${repo.status})`,
      );
    }

    const topK = Number(process.env.ASK_TOP_K ?? 8);
    const embedding = await this.openai.embed(question);
    const vectorLiteral = `[${embedding.join(",")}]`;

    const rows = await this.db.execute(sql`
      SELECT
        file_path AS "filePath",
        start_line AS "startLine",
        end_line AS "endLine",
        symbol_name AS "symbolName",
        content
      FROM code_chunks
      WHERE repo_id = ${repoId}::uuid
      ORDER BY embedding <=> ${vectorLiteral}::vector
      LIMIT ${topK}
    `);

    const chunks: PromptChunk[] = (
      rows.rows as Array<{
        filePath: string;
        startLine: number;
        endLine: number;
        symbolName: string | null;
        content: string;
      }>
    ).map((row) => ({
      filePath: row.filePath,
      startLine: Number(row.startLine),
      endLine: Number(row.endLine),
      symbolName: row.symbolName,
      content: row.content,
    }));

    if (chunks.length === 0) {
      const empty: AskResponseDto = {
        answer:
          "Não encontrei trechos indexados suficientes para responder esta pergunta.",
        citations: [],
        retrievedCitations: [],
      };
      await this.maybeLog(repoId, question, chunks, empty.answer);
      return empty;
    }

    const systemPrompt = buildAskSystemPrompt();
    const userPrompt = buildAskUserPrompt(question, chunks);
    const rawAnswer = await this.openai.chat(systemPrompt, userPrompt);
    const { answer } = sanitizeAnswerCitations(rawAnswer, chunks);
    const citations = citationsCitedInAnswer(answer, chunks);
    const retrievedCitations = chunksToCitations(chunks);

    await this.maybeLog(repoId, question, chunks, answer);

    return {
      answer,
      citations,
      retrievedCitations,
    };
  }

  private async maybeLog(
    repoId: string,
    question: string,
    chunks: PromptChunk[],
    answer: string,
  ): Promise<void> {
    const enabled = (process.env.ASK_LOG_ENABLED ?? "false").toLowerCase();
    if (enabled !== "true" && enabled !== "1") {
      return;
    }

    try {
      await this.db.insert(askLogs).values({
        repoId,
        question,
        retrievedChunks: chunks.map((c) => ({
          filePath: c.filePath,
          startLine: c.startLine,
          endLine: c.endLine,
          symbolName: c.symbolName,
        })),
        answer,
      });
    } catch (err) {
      console.warn("ASK_LOG write failed", err);
    }
  }
}
