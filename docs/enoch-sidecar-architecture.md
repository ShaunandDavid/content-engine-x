# Enoch Sidecar Architecture

## Current architecture

- `apps/web` currently owns the live Enoch product surface, route handlers, project creation, planning, chat, voice, feedback, and the active clip-generation trigger path.
- `services/orchestrator` is the durable workflow seam. It already owns stateful planning execution, workflow start, and background progression, but it is not yet the universal hot path for every Enoch action.
- `services/providers/sora` is the current provider-specific video boundary. The live provider union is still intentionally narrow and production-safe: `"sora"` only.
- `packages/shared` already acts as the repo's source of truth for cross-service contracts.

## Drift insertion point

Best first insertion point: an orchestration-side or server-side adapter boundary that Enoch can consult without making Drift a blocking dependency.

Recommended initial responsibilities:

- recall codebase conventions and prior architecture decisions
- capture new decisions and reusable workflow patterns
- surface reusable context packets for Enoch planning or operator assist flows

Recommended first usage pattern:

1. optional recall before a non-latency-critical planning/reasoning step
2. optional writeback after a durable decision or workflow milestone
3. no hard runtime dependency for page load, project creation, chat, voice, or routing

## Open-Sora insertion point

Best first insertion point: a separate worker/backend boundary that Enoch orchestrates over HTTP, instead of widening the live provider union immediately.

Recommended initial worker surface:

- `POST /video/generate`
- `GET /video/status?jobId=...`
- `GET /video/result?jobId=...`

Recommended role split:

- Enoch: owns product, orchestration, operator flow, and normalized project state
- Open-Sora worker: owns generation job execution, polling, and result materialization

## What this pass implements

- shared Drift and Open-Sora contracts in `packages/shared`
- env-gated optional sidecar clients in `apps/web/lib/server`
- no live runtime wiring into current user-facing flows
- no expansion of the active `"sora"` provider union

## What stays deferred

- putting Drift on any live request path
- replacing the current Sora provider in clip generation
- standing up a real Open-Sora backend service
- routing live generation traffic to Open-Sora before feature-flagged validation exists
