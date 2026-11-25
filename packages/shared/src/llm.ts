import OpenAI from "openai";

const DEFAULT_LLM_BASE_URL = "http://localhost:11434/v1";
const DEFAULT_CHAT_MODEL = "qwen2.5-coder:7b";
const DEFAULT_EMBEDDING_MODEL = "nomic-embed-text";
const DEFAULT_EMBEDDING_DIMENSIONS = 768;
const DEFAULT_EMBED_DOC_PREFIX = "search_document: ";
const DEFAULT_EMBED_QUERY_PREFIX = "search_query: ";
const DEFAULT_EMBED_BATCH_SIZE = 16;
const DEFAULT_LLM_TIMEOUT_MS = 120_000;
/** OpenAI SDK requires a non-empty apiKey; Ollama ignores it. */
const PLACEHOLDER_API_KEY = "ollama";

export interface LlmConfig {
  llmBaseUrl: string;
  chatBaseUrl: string;
  embedBaseUrl: string;
  apiKey: string;
  chatModel: string;
  embeddingModel: string;
  embeddingDimensions: number;
  embedDocPrefix: string;
  embedQueryPrefix: string;
  embedBatchSize: number;
  timeoutMs: number;
}

export type EnvLike = Record<string, string | undefined>;

function readEnv(env: EnvLike, key: string): string | undefined {
  const value = env[key];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Like readEnv, but preserves intentional empty strings (e.g. no embed prefix). */
function readEnvAllowEmpty(env: EnvLike, key: string): string | undefined {
  const value = env[key];
  if (value === undefined) return undefined;
  return value;
}

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
  label: string,
): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${label} must be a positive number, got: ${raw}`);
  }
  return Math.floor(n);
}

/** True when base URL points at a local Ollama OpenAI-compatible endpoint. */
export function isOllamaBaseUrl(baseUrl: string): boolean {
  try {
    const u = new URL(baseUrl);
    const host = u.hostname.toLowerCase();
    const port = u.port || (u.protocol === "https:" ? "443" : "80");
    const isLocalHost =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "host.docker.internal";
    return isLocalHost && port === "11434";
  } catch {
    return baseUrl.includes(":11434");
  }
}

/**
 * Load LLM / embedding settings from env.
 * Defaults target local Ollama. OpenAI is selected only by overriding these vars.
 */
export function loadLlmConfig(env: EnvLike = process.env): LlmConfig {
  const llmBaseUrl = readEnv(env, "LLM_BASE_URL") ?? DEFAULT_LLM_BASE_URL;
  const chatBaseUrl = readEnv(env, "CHAT_BASE_URL") ?? llmBaseUrl;
  const embedBaseUrl = readEnv(env, "EMBED_BASE_URL") ?? llmBaseUrl;

  const apiKey =
    readEnv(env, "LLM_API_KEY") ??
    readEnv(env, "OPENAI_API_KEY") ??
    PLACEHOLDER_API_KEY;

  const ollama = isOllamaBaseUrl(llmBaseUrl);

  const embedDocPrefixRaw = readEnvAllowEmpty(env, "EMBED_DOC_PREFIX");
  const embedQueryPrefixRaw = readEnvAllowEmpty(env, "EMBED_QUERY_PREFIX");
  const embedDocPrefix =
    embedDocPrefixRaw !== undefined
      ? embedDocPrefixRaw
      : ollama
        ? DEFAULT_EMBED_DOC_PREFIX
        : "";
  const embedQueryPrefix =
    embedQueryPrefixRaw !== undefined
      ? embedQueryPrefixRaw
      : ollama
        ? DEFAULT_EMBED_QUERY_PREFIX
        : "";

  const defaultBatch = ollama ? DEFAULT_EMBED_BATCH_SIZE : 64;
  const batchRaw =
    readEnv(env, "EMBED_BATCH_SIZE") ??
    readEnv(env, "OPENAI_EMBED_BATCH_SIZE");

  return {
    llmBaseUrl,
    chatBaseUrl,
    embedBaseUrl,
    apiKey: apiKey.trim() === "" ? PLACEHOLDER_API_KEY : apiKey,
    chatModel:
      readEnv(env, "CHAT_MODEL") ??
      readEnv(env, "OPENAI_CHAT_MODEL") ??
      DEFAULT_CHAT_MODEL,
    embeddingModel:
      readEnv(env, "EMBEDDING_MODEL") ??
      readEnv(env, "OPENAI_EMBEDDING_MODEL") ??
      DEFAULT_EMBEDDING_MODEL,
    embeddingDimensions: parsePositiveInt(
      readEnv(env, "EMBEDDING_DIMENSIONS"),
      DEFAULT_EMBEDDING_DIMENSIONS,
      "EMBEDDING_DIMENSIONS",
    ),
    embedDocPrefix,
    embedQueryPrefix,
    embedBatchSize: parsePositiveInt(
      batchRaw,
      defaultBatch,
      "EMBED_BATCH_SIZE",
    ),
    timeoutMs: parsePositiveInt(
      readEnv(env, "LLM_TIMEOUT_MS"),
      DEFAULT_LLM_TIMEOUT_MS,
      "LLM_TIMEOUT_MS",
    ),
  };
}

export function applyEmbedPrefix(text: string, prefix: string): string {
  if (!prefix) return text;
  if (text.startsWith(prefix)) return text;
  return `${prefix}${text}`;
}

export function assertEmbeddingDimensions(
  embedding: number[],
  expected: number,
): void {
  if (embedding.length !== expected) {
    throw new Error(
      `Embedding dimension mismatch: got ${embedding.length}, expected ${expected} (EMBEDDING_DIMENSIONS). ` +
        "Trocar de provedor ou modelo de embeddings exige reindexar (e alinhar a coluna vector / migration).",
    );
  }
}

export function isLlmConnectionError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as {
    code?: string;
    cause?: { code?: string };
    message?: string;
  };
  const code = e.code ?? e.cause?.code;
  if (
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN" ||
    code === "ETIMEDOUT" ||
    code === "ECONNRESET"
  ) {
    return true;
  }
  const msg = (e.message ?? "").toLowerCase();
  return (
    msg.includes("econnrefused") ||
    msg.includes("fetch failed") ||
    msg.includes("connect econnrefused") ||
    msg.includes("network error")
  );
}

export function friendlyLlmError(err: unknown, baseUrl: string): Error {
  if (isLlmConnectionError(err) && isOllamaBaseUrl(baseUrl)) {
    return new Error(
      `Ollama não está acessível em ${baseUrl}. Rode \`ollama serve\` e confira se os modelos estão baixados.`,
    );
  }
  if (isLlmConnectionError(err)) {
    return new Error(
      `LLM não está acessível em ${baseUrl}. Verifique LLM_BASE_URL / CHAT_BASE_URL / EMBED_BASE_URL e a rede.`,
    );
  }
  if (err instanceof Error) return err;
  return new Error(String(err));
}

export function createOpenAiClient(options: {
  baseURL: string;
  apiKey: string;
  timeoutMs: number;
}): OpenAI {
  return new OpenAI({
    apiKey: options.apiKey,
    baseURL: options.baseURL,
    timeout: options.timeoutMs,
  });
}

export interface EmbeddingClient {
  readonly model: string;
  readonly dimensions: number;
  readonly batchSize: number;
  embedQuery(text: string): Promise<number[]>;
  embedDocuments(texts: string[]): Promise<number[][]>;
}

export interface ChatClient {
  readonly model: string;
  chat(system: string, user: string): Promise<string>;
}

function truncateForEmbed(text: string): string {
  return text.length > 20_000 ? text.slice(0, 20_000) : text;
}

export function createEmbeddingClient(
  config: LlmConfig = loadLlmConfig(),
): EmbeddingClient {
  const client = createOpenAiClient({
    baseURL: config.embedBaseUrl,
    apiKey: config.apiKey,
    timeoutMs: config.timeoutMs,
  });

  async function embedRaw(inputs: string[]): Promise<number[][]> {
    try {
      const res = await client.embeddings.create({
        model: config.embeddingModel,
        input: inputs,
      });
      const sorted = [...res.data].sort((a, b) => a.index - b.index);
      const vectors = sorted.map((d) => d.embedding);
      for (const v of vectors) {
        assertEmbeddingDimensions(v, config.embeddingDimensions);
      }
      return vectors;
    } catch (err) {
      throw friendlyLlmError(err, config.embedBaseUrl);
    }
  }

  return {
    model: config.embeddingModel,
    dimensions: config.embeddingDimensions,
    batchSize: config.embedBatchSize,
    async embedQuery(text: string): Promise<number[]> {
      const input = applyEmbedPrefix(
        truncateForEmbed(text),
        config.embedQueryPrefix,
      );
      const [vector] = await embedRaw([input]);
      return vector;
    },
    async embedDocuments(texts: string[]): Promise<number[][]> {
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += config.embedBatchSize) {
        const batch = texts
          .slice(i, i + config.embedBatchSize)
          .map((t) =>
            applyEmbedPrefix(truncateForEmbed(t), config.embedDocPrefix),
          );
        let attempt = 0;
        for (;;) {
          try {
            const vectors = await embedRaw(batch);
            out.push(...vectors);
            break;
          } catch (err) {
            attempt += 1;
            if (attempt >= 3 || isLlmConnectionError(err)) throw err;
            await new Promise((r) => setTimeout(r, 1000 * attempt));
          }
        }
      }
      return out;
    },
  };
}

export function createChatClient(
  config: LlmConfig = loadLlmConfig(),
): ChatClient {
  const client = createOpenAiClient({
    baseURL: config.chatBaseUrl,
    apiKey: config.apiKey,
    timeoutMs: config.timeoutMs,
  });

  return {
    model: config.chatModel,
    async chat(system: string, user: string): Promise<string> {
      try {
        const res = await client.chat.completions.create({
          model: config.chatModel,
          temperature: 0.2,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        });
        return res.choices[0]?.message?.content?.trim() ?? "";
      } catch (err) {
        throw friendlyLlmError(err, config.chatBaseUrl);
      }
    },
  };
}

/** Convenience factory used by API and worker. */
export function createLlmClients(config: LlmConfig = loadLlmConfig()): {
  config: LlmConfig;
  chat: ChatClient;
  embeddings: EmbeddingClient;
} {
  return {
    config,
    chat: createChatClient(config),
    embeddings: createEmbeddingClient(config),
  };
}
