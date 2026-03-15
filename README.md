# CONTENT ENGINE X

CONTENT ENGINE X is a production-oriented monorepo for generating, reviewing, rendering, and handing off short-form social video content.

## Phase 1 scope

- Next.js operator dashboard shell
- Shared TypeScript contracts with Zod validation
- Supabase schema migration
- LangGraph orchestration skeleton in Python 3.13
- Provider-agnostic video generation interface with a Sora implementation
- FFmpeg media processing service skeleton
- Dockerized local service layout

## Workspaces

- `apps/web` - operator dashboard
- `services/orchestrator` - LangGraph workflow orchestration
- `services/media` - FFmpeg media processing
- `services/providers/sora` - OpenAI Sora provider wrapper
- `packages/shared` - shared contracts and validation
- `packages/db` - database config and migration assets

## Getting started

1. Copy `.env.example` into the service-level `.env` files you need.
2. Install JavaScript dependencies with `pnpm install`.
3. Create a Python virtual environment inside `services/orchestrator` and install with `pip install -e .`.
4. Apply the SQL migration in `packages/db/supabase/migrations/0001_initial_schema.sql`.
5. Ensure `CONTENT_ENGINE_OPERATOR_USER_ID` points at an existing operator row in `public.users`, or let the app fall back to the first available operator user.
6. Start local services with `docker compose -f infra/docker/docker-compose.yml up --build`.
