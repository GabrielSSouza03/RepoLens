import { afterEach, describe, expect, it } from "vitest";
import {
  applyEmbedPrefix,
  assertEmbeddingDimensions,
  isOllamaBaseUrl,
  loadLlmConfig,
} from "./llm";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, ORIGINAL_ENV);
});

describe("loadLlmConfig", () => {
  it("defaults to Ollama with nomic prefixes and batch 16", () => {
    const cfg = loadLlmConfig({
      LLM_BASE_URL: undefined,
      LLM_API_KEY: undefined,
      OPENAI_API_KEY: undefined,
      CHAT_MODEL: undefined,
      EMBEDDING_MODEL: undefined,
      EMBEDDING_DIMENSIONS: undefined,
      EMBED_DOC_PREFIX: undefined,
      EMBED_QUERY_PREFIX: undefined,
      EMBED_BATCH_SIZE: undefined,
      CHAT_BASE_URL: undefined,
      EMBED_BASE_URL: undefined,
    });

    expect(cfg.llmBaseUrl).toBe("http://localhost:11434/v1");
    expect(cfg.chatBaseUrl).toBe("http://localhost:11434/v1");
    expect(cfg.embedBaseUrl).toBe("http://localhost:11434/v1");
    expect(cfg.apiKey).toBe("ollama");
    expect(cfg.chatModel).toBe("qwen2.5-coder:7b");
    expect(cfg.embeddingModel).toBe("nomic-embed-text");
    expect(cfg.embeddingDimensions).toBe(768);
    expect(cfg.embedDocPrefix).toBe("search_document: ");
    expect(cfg.embedQueryPrefix).toBe("search_query: ");
    expect(cfg.embedBatchSize).toBe(16);
  });

  it("uses CHAT_BASE_URL and EMBED_BASE_URL when set", () => {
    const cfg = loadLlmConfig({
      LLM_BASE_URL: "http://localhost:11434/v1",
      CHAT_BASE_URL: "http://chat.example/v1",
      EMBED_BASE_URL: "http://embed.example/v1",
      LLM_API_KEY: "k",
    });
    expect(cfg.chatBaseUrl).toBe("http://chat.example/v1");
    expect(cfg.embedBaseUrl).toBe("http://embed.example/v1");
    expect(cfg.apiKey).toBe("k");
  });

  it("reads OpenAI-style overrides and clears prefixes when empty", () => {
    const cfg = loadLlmConfig({
      LLM_BASE_URL: "https://api.openai.com/v1",
      LLM_API_KEY: "sk-test",
      CHAT_MODEL: "gpt-4o-mini",
      EMBEDDING_MODEL: "text-embedding-3-small",
      EMBEDDING_DIMENSIONS: "1536",
      EMBED_DOC_PREFIX: "",
      EMBED_QUERY_PREFIX: "",
      EMBED_BATCH_SIZE: "64",
    });

    expect(cfg.chatModel).toBe("gpt-4o-mini");
    expect(cfg.embeddingModel).toBe("text-embedding-3-small");
    expect(cfg.embeddingDimensions).toBe(1536);
    expect(cfg.embedDocPrefix).toBe("");
    expect(cfg.embedQueryPrefix).toBe("");
    expect(cfg.embedBatchSize).toBe(64);
    expect(isOllamaBaseUrl(cfg.llmBaseUrl)).toBe(false);
  });

  it("does not require OPENAI_API_KEY for Ollama", () => {
    const cfg = loadLlmConfig({
      LLM_BASE_URL: "http://host.docker.internal:11434/v1",
    });
    expect(cfg.apiKey).toBe("ollama");
    expect(isOllamaBaseUrl(cfg.llmBaseUrl)).toBe(true);
  });
});

describe("applyEmbedPrefix", () => {
  it("applies document and query prefixes", () => {
    expect(applyEmbedPrefix("hello", "search_document: ")).toBe(
      "search_document: hello",
    );
    expect(applyEmbedPrefix("q", "search_query: ")).toBe("search_query: q");
  });

  it("skips when prefix empty or already present", () => {
    expect(applyEmbedPrefix("hello", "")).toBe("hello");
    expect(applyEmbedPrefix("search_query: q", "search_query: ")).toBe(
      "search_query: q",
    );
  });
});

describe("assertEmbeddingDimensions", () => {
  it("passes when length matches", () => {
    expect(() => assertEmbeddingDimensions([1, 2, 3], 3)).not.toThrow();
  });

  it("throws a clear error on mismatch", () => {
    expect(() => assertEmbeddingDimensions([1, 2], 768)).toThrow(
      /Embedding dimension mismatch: got 2, expected 768/,
    );
  });
});
