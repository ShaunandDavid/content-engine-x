# Phase 1 Architecture

## System boundaries

- `apps/web` owns operator-facing workflows and project review surfaces.
- `services/orchestrator` owns workflow state transitions, stage retries, approvals, and resumability.
- `services/providers/sora` implements the provider-specific video generation contract.
- `services/media` owns FFmpeg-based normalization, compositing, and render assembly.
- `packages/shared` defines canonical TypeScript contracts for projects, prompts, assets, and provider requests.
- `packages/db` contains Supabase-facing configuration and the initial relational schema.

## Design decisions

1. Provider-agnostic clip generation is modeled through shared request and result contracts, with Sora-specific normalization isolated in its own service.
2. Workflow durability is represented through `workflow_runs` database state plus LangGraph checkpointer injection, avoiding a hard dependency on any single checkpoint backend in phase 1.
3. Scene, prompt, clip, and render entities all carry status, metadata, and error fields so retries and auditability remain first-class concerns.
4. The web app is intentionally a shell in phase 1, but its route map already matches the operator flow required for review and handoff.

## External integrations

- OpenAI Sora for clip generation
- Supabase for auth, relational state, and metadata
- Cloudflare R2 for asset storage
- n8n webhook handoff for publishing orchestration
- FFmpeg for media processing
