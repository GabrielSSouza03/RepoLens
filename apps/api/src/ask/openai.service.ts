import {
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  createChatClient,
  createEmbeddingClient,
  loadLlmConfig,
  type ChatClient,
  type EmbeddingClient,
  type LlmConfig,
} from "@repolens/shared";

@Injectable()
export class OpenAiService {
  private readonly config: LlmConfig;
  private readonly chatClient: ChatClient;
  private readonly embeddingClient: EmbeddingClient;

  readonly chatModel: string;
  readonly embeddingModel: string;

  constructor() {
    this.config = loadLlmConfig();
    this.chatClient = createChatClient(this.config);
    this.embeddingClient = createEmbeddingClient(this.config);
    this.chatModel = this.config.chatModel;
    this.embeddingModel = this.config.embeddingModel;
  }

  async embed(text: string): Promise<number[]> {
    try {
      return await this.embeddingClient.embedQuery(text);
    } catch (err) {
      this.rethrowHttp(err);
    }
  }

  async chat(system: string, user: string): Promise<string> {
    try {
      return await this.chatClient.chat(system, user);
    } catch (err) {
      this.rethrowHttp(err);
    }
  }

  private rethrowHttp(err: unknown): never {
    const message = err instanceof Error ? err.message : String(err);
    if (
      message.includes("ollama serve") ||
      message.includes("não está acessível") ||
      message.includes("LLM não está acessível")
    ) {
      throw new ServiceUnavailableException(message);
    }
    throw err;
  }
}
