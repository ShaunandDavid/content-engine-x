# CONTENT ENGINE X — Claude Handoff

Last validated: 2026-03-16

## What this project is

CONTENT ENGINE X is a monorepo for end-to-end AI-powered short-form video production. An operator submits a brief, the system generates a campaign concept, plans scenes, creates Sora prompts, generates video clips, holds for human QC review, composites a final render (FFmpeg), and hands off a publish payload to n8n.

Target platforms: TikTok, Instagram Reels, YouTube Shorts, LinkedIn.

## Architecture

```
apps/web (Next.js 15, React 19)        Operator dashboard + API routes
  |
  +-- packages/shared                  Zod schemas + TypeScript contracts
  +-- packages/db                      Supabase client, project-workflow CRUD, clip-pipeline CRUD
  |
  +-- services/providers/sora          OpenAI Sora wrapper (provider-agnostic interface)
  +-- services/media                   FFmpeg pipeline (normalize, stitch, captions, logo, end card, music)
  +-- services/orchestrator            Python 3.13 + LangGraph 0.3 stateful workflow (8 stages)
  |
  +-- Supabase (Postgres)              12 tables, full relational schema
  +-- Cloudflare R2                    Asset storage (video, thumbnails, brand assets)
  +-- n8n                              Publish webhook handoff
```

Monorepo tooling: pnpm workspaces, Turborepo, TypeScript 5.9, Docker Compose.

## Completed phases (1-3)

Everything below is built, committed, type-checks clean, and builds without errors.

- Next.js operator dashboard shell with app-router pages (login, projects, create, clips, render, publish)
- API routes: `POST /api/projects`, `POST /api/projects/[id]/clips/generate`, `POST /api/projects/[id]/clips/poll`
- Shared TypeScript contracts (`packages/shared`): 14 record types, 7 enums, Zod input schemas
- Supabase schema migration (`0001_initial_schema.sql`): 12 tables, 7 custom enums, 11 auto-updated_at triggers, 10 indexes
- Database CRUD layer (`packages/db`): `createProjectWorkflow`, `getProjectWorkspace`, clip/asset/audit CRUD, workflow state updates
- LangGraph orchestrator (Python): 8-node directed graph with conditional routing, approval halt, stage resumability
- Sora provider: `generateClip`, `pollClip`, `downloadResult` with retry + exponential backoff
- Media service: 8 FFmpeg operations (normalize, stitch, aspect-ratio pad, caption burn, logo overlay, end card, music mix, thumbnail extract)
- Clip generation pipeline in web app: full generate/poll/download/persist-to-R2 flow wired through API routes
- Docker Compose layout for all services
- Provider-agnostic video generation interface (adding a new provider = one new service + one switch case)

## Current validation status

| Component | Status |
|-----------|--------|
| `turbo build` (5 packages) | All pass, zero errors |
| `turbo typecheck` (8 tasks) | All pass, zero errors |
| pnpm lockfile | Up to date, no drift |
| LangGraph `build_workflow()` | Compiles, 8 stage nodes confirmed |
| Python deps (langgraph, pydantic, dotenv) | All installed |
| Node 24.12 / pnpm 10.6 | Available |
| FFmpeg 8.0.1 / FFprobe 8.0.1 | Installed (WinGet), not on default PATH |

### Bug fix applied during validation

The LangGraph node name `publish_payload` collided with the `WorkflowState.publish_payload` key (LangGraph >=0.3 rejects this). Node renamed to `publish_handoff` in `graph.py`. The state key and node function are unchanged.

## Confirmed blockers

These are the only things preventing runtime:

| Blocker | Impact | Type |
|---------|--------|------|
| No `.env` file exists | All runtime fails | config |
| `NEXT_PUBLIC_SUPABASE_URL` | Web app + all DB ops | credential |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser Supabase client | credential |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side DB ops | credential |
| `SUPABASE_DB_URL` | Python orchestrator DB access | credential |
| `OPENAI_API_KEY` | Sora clip generation | credential |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Asset upload after clip download | credential |
| `FFMPEG_BIN` / `FFPROBE_BIN` not set to absolute path | Media service subprocess calls | env path |
| Supabase migration not applied | All tables missing | infra |

## What is NOT blocked

- Build toolchain: fully working
- TypeScript compilation: zero errors across all workspaces
- LangGraph graph: compiles and routes correctly
- All code is committed and clean (`git status` shows nothing)
- Architecture: sound, no redesign needed

## Important file paths

```
Root config
  package.json                          pnpm workspace root, turbo scripts
  turbo.json                            build/dev/typecheck/lint task definitions
  pnpm-workspace.yaml                   workspace: apps/*, packages/*, services/**, infra/*
  tsconfig.base.json                    shared TS config (ES2023, bundler resolution)
  .env.example                          all env vars documented

Packages
  packages/shared/src/types/core.ts     all record types + enums
  packages/shared/src/types/providers.ts VideoGenerationProvider interface
  packages/shared/src/schemas/          Zod validation schemas
  packages/db/src/client.ts             Supabase client factory (browser + service)
  packages/db/src/project-workflow.ts   createProjectWorkflow, getProjectWorkspace
  packages/db/src/clip-pipeline.ts      clip/asset/audit CRUD, workflow state updates
  packages/db/supabase/migrations/0001_initial_schema.sql

Services
  services/orchestrator/src/content_engine_x_orchestrator/graph.py     8-node LangGraph DAG
  services/orchestrator/src/content_engine_x_orchestrator/state.py     WorkflowState TypedDict
  services/orchestrator/src/content_engine_x_orchestrator/runtime.py   create_initial_state, invoke_workflow, sample main()
  services/orchestrator/src/content_engine_x_orchestrator/nodes/       8 stage node implementations
  services/providers/sora/src/sora-provider.ts                         SoraProvider class
  services/media/src/pipeline.ts                                       assembleRender orchestration
  services/media/src/ffmpeg.ts                                         8 FFmpeg operations

Web app
  apps/web/app/api/projects/route.ts                            POST create project
  apps/web/app/api/projects/[projectId]/clips/generate/route.ts POST trigger generation
  apps/web/app/api/projects/[projectId]/clips/poll/route.ts     POST poll clip status
  apps/web/lib/server/clip-generation.ts                        full generate/poll/persist pipeline
  apps/web/lib/server/r2-storage.ts                             R2 upload via @aws-sdk/client-s3
  apps/web/lib/server/video-provider-registry.ts                provider switch (currently: sora only)

Infra
  infra/docker/docker-compose.yml       web + orchestrator + media services
  infra/docker/web.Dockerfile
  infra/docker/orchestrator.Dockerfile
  infra/docker/media.Dockerfile
```

## Provider strategy

The system is provider-agnostic by design:

- `VideoGenerationProvider` interface defined in `packages/shared/src/types/providers.ts`
- Only Sora is implemented (`services/providers/sora`)
- `video-provider-registry.ts` is the single switch point for adding providers
- `ProviderName` type is currently `"sora"` only — extend the union + add a case
- The Supabase enum `provider_name` also needs an `ALTER TYPE` for new providers

## What should NOT be changed

- The monorepo structure (pnpm workspaces + turbo)
- The database schema design (12 tables, relational integrity)
- The LangGraph 8-stage workflow topology
- The provider-agnostic interface pattern
- The Zod-validated contracts in `packages/shared`
- The separation between web app, orchestrator, media service, and provider services

## Smallest path to end-to-end generation test

1. **Create `.env`** from `.env.example` with real credentials (Supabase, OpenAI, R2) and full FFmpeg paths
2. **Apply migration** `0001_initial_schema.sql` to Supabase project
3. **Create a user row** in the `users` table (required FK for `projects.owner_user_id`)
4. **`pnpm dev`** — verify Next.js starts on `:3000`
5. **`POST /api/projects`** with a sample brief — verify project + scenes + prompts created in DB
6. **`POST /api/projects/{id}/clips/generate`** — verify Sora job dispatched, clip rows created
7. **`POST /api/projects/{id}/clips/poll`** — verify status updates, asset persisted to R2 on completion

Steps 1-3 are human/credential tasks. Steps 4-7 are automated validation.

## Open questions / decisions pending

1. **R2 deferral**: Can we write generated clips to local disk first and defer R2 setup? This would let us test the Sora pipeline without Cloudflare credentials. Requires a small change to `r2-storage.ts` (local fallback).

2. **Orchestrator integration**: The Python orchestrator and the Next.js clip pipeline are currently parallel implementations of the same workflow. The web app drives clip generation directly via API routes. The orchestrator is a standalone LangGraph graph. They are not yet connected. Decision needed: does the web app call the orchestrator, or does the orchestrator run independently and the web app reads its state?

3. **User/auth bootstrapping**: The `users` table references `auth.users` (Supabase Auth). For a first test, do we create a Supabase Auth user, or insert a test row directly with a hardcoded UUID?

4. **Missing tests**: No test suite exists for any package. When should tests be added, and what should be tested first?

5. **n8n webhook**: `N8N_PUBLISH_WEBHOOK_URL` is required by the publish stage. Is n8n already set up, or should the publish stage be stubbed for now?

6. **Brand assets**: `BRAND_LOGO_ASSET_KEY` and `END_CARD_ASSET_KEY` reference R2 objects. Are these uploaded, or should the render pipeline skip logo/end-card when keys are empty?
