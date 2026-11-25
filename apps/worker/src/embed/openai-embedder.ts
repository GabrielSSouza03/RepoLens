import {
  createEmbeddingClient,
  loadLlmConfig,
  type EmbeddingClient,
} from "@repolens/shared";

export class OpenAiEmbedder {
  private readonly client: EmbeddingClient;

  constructor(client?: EmbeddingClient) {
    this.client = client ?? createEmbeddingClient(loadLlmConfig());
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return this.client.embedDocuments(texts);
  }
}
