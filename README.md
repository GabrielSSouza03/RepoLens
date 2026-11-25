# RepoLens

Agente de onboarding de código: indexa um repositório público do GitHub e responde perguntas citando `arquivo:linha_inicial-linha_final`.

## Stack

- `apps/api` — NestJS (HTTP + retrieve + chat)
- `apps/worker` — clone, chunking tree-sitter, embeddings (BullMQ)
- `apps/web` — Next.js (UI mínima)
- `packages/shared` — tipos, schema Drizzle, contratos, fábrica LLM/embeddings
- PostgreSQL + pgvector (HNSW), Redis + BullMQ

### Por que Drizzle

- Suporte direto a **pgvector** no schema/SQL
- SQL explícito quando o retrieve precisa (ex.: `ORDER BY embedding <=> …`)
- Migrations versionadas em `apps/api/drizzle/`
- Índice **HNSW** criado na migration inicial (`code_chunks_embedding_hnsw_idx`)

## Limites de segurança (MVP)

- **Sem autenticação** — qualquer cliente na rede alcançável pode indexar e perguntar
- Pensado para **rodar só localmente** (localhost / Docker Compose na sua máquina)
- Não exponha a API/web na internet sem auth, rate limit e isolamento de rede
- Clone só de URLs públicas `https://github.com/owner/repo`; owner/name inválidos (`..`, `.`, chars fora de `[A-Za-z0-9._-]`) → 400
- Indexação ignora dotfiles (exceto `.env.example` e `.github/workflows`), honra `.gitignore`, nunca indexa `.env` / `.env.*` / chaves / certificados
- Tamanho do clone limitado (`MAX_REPO_SIZE_BYTES`, `git clone --filter=blob:limit=…` + abort se a pasta passar do limite)

## Rodar de graça com Ollama

Padrão do projeto: chat + embeddings via API compatível OpenAI do Ollama (`http://localhost:11434/v1`). Sem `OPENAI_API_KEY`.

```bash
# 1) Ollama no host (snap costuma já estar ativo — não precisa `ollama serve`)
ollama pull qwen2.5-coder:7b
ollama pull nomic-embed-text

# Snap escuta só 127.0.0.1 por padrão; Docker precisa de 0.0.0.0:
sudo snap set ollama host=0.0.0.0:11434
sudo snap restart ollama

# 2) Env
cp .env.example .env
# LLM_BASE_URL=http://host.docker.internal:11434/v1  (Compose)
# Se api/worker rodarem no host: http://localhost:11434/v1

# 3) Subir
docker compose up --build
```

`api` e `worker` usam `extra_hosts: host.docker.internal:host-gateway` para falar com o Ollama do host. Se `.env` tiver `localhost`, o container fala consigo mesmo e falha.

Variáveis principais: `LLM_BASE_URL`, `LLM_API_KEY` (placeholder `ollama`), `CHAT_MODEL`, `EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS`, `EMBED_DOC_PREFIX` / `EMBED_QUERY_PREFIX` (nomic), `EMBED_BATCH_SIZE` (16), `LLM_TIMEOUT_MS`. Opcional: `CHAT_BASE_URL` / `EMBED_BASE_URL` (caem em `LLM_BASE_URL`).

## Usar OpenAI

No `.env`, troque o bloco Ollama pelo comentado de OpenAI (ou edite):

```bash
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=sk-...
CHAT_MODEL=gpt-4o-mini
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
EMBED_DOC_PREFIX=
EMBED_QUERY_PREFIX=
EMBED_BATCH_SIZE=64
```

**Reindexar** depois de trocar provedor/modelo/dimensão de embeddings. A coluna pgvector hoje é `vector(768)`; `1536` exige nova migration alinhada a `EMBEDDING_DIMENSIONS` + reindex de todos os repos.

## Subir com Docker Compose

```bash
cp .env.example .env
docker compose up --build
```

Builds usam `pnpm-lock.yaml` com `pnpm install --frozen-lockfile`.

Serviços:

- Web: http://localhost:3000
- API: http://localhost:3001
- Postgres: localhost:5432
- Redis: localhost:6379

A API aplica as migrations na subida.

## Ask quality

Chat e embeddings usam o cliente OpenAI SDK com `baseURL` configurável (Ollama ou OpenAI). Otimização sem trocar o provedor:

- Skill sempre-on: `apps/api/src/ask/skills/ask-core.md` (grounding, citations, abstain)
- Strip de `path:start-end` inventados na resposta
- `citations` = só trechos cujo `arquivo:start-end` aparece na resposta (ordem de aparição); vazio se nenhuma citação válida
- UI: "Trechos citados" + bloco recolhível "Contexto recuperado" (top-K)
- `ASK_LOG_ENABLED=true` grava asks em `ask_logs` (dataset futuro). Default: `false`
- Eval local: golden `passport` + métricas `hit@K` / `citationValidity` / `abstainRate`

## Fluxo rápido

1. Abra a web e indexe `https://github.com/jaredhanson/passport`
2. Espere o status `ready`
3. Pergunte: `onde é feita a autenticação?`
4. Confira a resposta e os trechos citados

## Desenvolvimento local (sem Compose completo)

```bash
npx pnpm@9 install
npx pnpm@9 --filter @repolens/shared build
# suba postgres+redis via compose:
docker compose up postgres redis -d
npx pnpm@9 --filter @repolens/api db:migrate
npx pnpm@9 --filter @repolens/api dev
npx pnpm@9 --filter @repolens/worker dev
npx pnpm@9 --filter @repolens/web dev
```

## Testes

```bash
npx pnpm@9 test
# ou:
npx pnpm@9 -r test
```

`pretest` / script root compilam `@repolens/shared` antes.

## Eval (ask quality)

Com a API no ar e um repo `passport` indexado:

```bash
EVAL_REPO_ID=<uuid> npx pnpm@9 --filter @repolens/api eval:ask
```

Golden: `apps/api/evals/passport-golden.json`.

## Nota sobre embeddings

A dimensão do vetor está em **768** (`nomic-embed-text`). Trocar provedor/modelo/dimensão exige migration alinhada + **reindexação**. Na subida, o cliente valida o tamanho do vetor contra `EMBEDDING_DIMENSIONS`.
