FROM node:20-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates git python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

FROM base AS build
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json .npmrc ./
COPY apps/api/package.json ./apps/api/
COPY apps/worker/package.json ./apps/worker/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared ./packages/shared
COPY apps/worker ./apps/worker
RUN pnpm install --frozen-lockfile --filter @repolens/worker...
RUN pnpm --filter @repolens/shared build \
 && test -f packages/shared/dist/index.d.ts
RUN pnpm --filter @repolens/worker build
RUN mkdir -p /deploy \
 && cp -R apps/worker/dist /deploy/dist \
 && cp apps/worker/package.json /deploy/package.json \
 && cp -R node_modules /deploy/node_modules \
 && cp -R packages /deploy/packages

FROM node:20-bookworm-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
RUN mkdir -p /data/repos
COPY --from=build /deploy/ ./
CMD ["node", "dist/main.js"]
