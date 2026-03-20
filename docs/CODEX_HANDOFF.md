# CODEX HANDOFF

Current checkpoint: integrated Python planning seam is now saved as a working architecture checkpoint, not a production-ready planner.

What is now proven:
- The feature-flagged async Python orchestrator path is wired.
- Next.js can initialize `projects`, `briefs`, and `workflow_runs` for Python-owned planning.
- Next.js can trigger the Python orchestrator asynchronously over HTTP.
- The Python orchestrator health endpoint works.
- The Python planning path can progress through planning stages and persist planning output into Supabase.
- Python-generated `scenes` and `prompts` are now consumable by the existing TypeScript clip generation path.
- Clip generation completed successfully on the Python-planned test project.
- This proves the architecture seam between Python reasoning and TypeScript execution is viable.

What remains unproven:
- Planner output quality is not production-ready.
- Final render was not re-verified in this checkpoint on the Python-planned path.
- Publish handoff was not re-verified in this checkpoint on the Python-planned path.
- I am not claiming a full Python-planned project has been re-run end-to-end through render and publish in this checkpoint.
- I am not claiming rerun behavior, recovery behavior, or operator UX around long-running orchestration is production-ready.

Current known blockers:
- Planning output cleanliness and consistency still need work before production use.
- The Python orchestrator is still a thin integration seam, not yet a hardened production orchestration service.
- Error handling and observability are improved but still lightweight compared with what a production worker system should have.
- The UI truthfully reflects planning state, but operator polish around planning lifecycle is still minimal.

Next recommended engineering task:
- Improve Python planner output quality and tighten prompt/scene generation so the planning stage produces cleaner, more reliable inputs before re-validating final render and publish on the Python-owned path.

Exact files included in this checkpoint:
- `.env.example`
- `apps/web/app/api/projects/route.ts`
- `apps/web/app/projects/[projectId]/clips/page.tsx`
- `apps/web/app/projects/[projectId]/page.tsx`
- `apps/web/app/projects/[projectId]/scenes/page.tsx`
- `apps/web/app/projects/new/page.tsx`
- `apps/web/lib/server/live-runtime-preflight.ts`
- `apps/web/lib/server/python-orchestrator.ts`
- `docs/CODEX_HANDOFF.md`
- `infra/docker/docker-compose.yml`
- `infra/docker/orchestrator.Dockerfile`
- `packages/db/src/project-workflow.ts`
- `services/orchestrator/.env.example`
- `services/orchestrator/pyproject.toml`
- `services/orchestrator/src/content_engine_x_orchestrator/__init__.py`
- `services/orchestrator/src/content_engine_x_orchestrator/api.py`
- `services/orchestrator/src/content_engine_x_orchestrator/config.py`
- `services/orchestrator/src/content_engine_x_orchestrator/service.py`
- `services/orchestrator/src/content_engine_x_orchestrator/state.py`
- `services/orchestrator/src/content_engine_x_orchestrator/supabase_store.py`

Truth status:
- This is a checkpoint save of real integration progress.
- The seam is validated through Python planning -> Supabase -> TypeScript clip generation.
- Planner quality is still not ready for production rollout.
