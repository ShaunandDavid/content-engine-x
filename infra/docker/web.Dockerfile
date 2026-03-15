FROM node:20-bookworm-slim

WORKDIR /app
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/web ./apps/web
COPY packages/shared ./packages/shared
COPY packages/db ./packages/db

RUN corepack enable && corepack prepare pnpm@10.6.0 --activate
RUN pnpm install --filter @content-engine/web...

WORKDIR /app/apps/web
EXPOSE 3000
CMD ["pnpm", "dev"]
