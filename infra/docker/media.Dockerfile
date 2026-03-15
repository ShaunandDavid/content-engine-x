FROM node:20-bookworm-slim

WORKDIR /app
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY services/media ./services/media
COPY packages/shared ./packages/shared

RUN corepack enable && corepack prepare pnpm@10.6.0 --activate
RUN pnpm install --filter @content-engine/media...

WORKDIR /app/services/media
CMD ["pnpm", "typecheck"]
