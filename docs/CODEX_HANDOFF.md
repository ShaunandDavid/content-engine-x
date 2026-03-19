# CODEX HANDOFF

Current task: wire Publish Handoff into a real outbound n8n webhook send from the web app.

Commit hash: not committed in this turn. Workspace HEAD is `3ec8e11`.

Exact files changed in this turn:
- `packages/db/src/clip-pipeline.ts`
- `apps/web/lib/server/publish-handoff.ts`
- `apps/web/app/api/projects/[projectId]/publish/route.ts`
- `apps/web/components/publish-actions.tsx`
- `apps/web/app/projects/[projectId]/publish/page.tsx`
- `docs/CODEX_HANDOFF.md`

Behavioral summary of changes:
- Added DB helpers to create, update, and fetch `publish_jobs`.
- Added a real server-side publish handoff that:
  - loads the latest render
  - verifies the latest render is completed
  - verifies the persisted master asset exists and has a path
  - includes the thumbnail path when available
  - verifies `N8N_PUBLISH_WEBHOOK_URL` is set
  - POSTs the payload to the configured webhook
  - persists the publish attempt, payload snapshot, response summary, and failure reason
  - updates project/workflow state at `publish_payload`
  - appends audit logs for started/completed/failed handoff attempts
- Updated the publish page to:
  - show a real payload preview based on the latest render and persisted assets
  - allow live send for non-demo projects
  - show latest persisted publish success/failure status and response status
  - keep demo publish isolated and disabled

What is now working:
- `/projects/[projectId]/publish` can trigger a real server-side webhook POST for non-demo projects.
- The webhook attempt is persisted in `public.publish_jobs`.
- The outbound payload snapshot is persisted.
- HTTP response status/body summary or network failure reason is persisted.
- The page surfaces the latest publish attempt result instead of preview-only sample text.

Remaining blockers / what is still unproven:
- This does not prove n8n accepted and processed the payload correctly beyond the HTTP response captured by the app.
- I did not run a real webhook send against your live `N8N_PUBLISH_WEBHOOK_URL` in this turn.
- Hashtags/caption are still minimal and derived from existing project data. No new publish metadata system was added.
- No platform-native publish delivery was added.

Required env vars / migrations:
- New env var used by this turn:
  - `N8N_PUBLISH_WEBHOOK_URL`
    - used in `apps/web/lib/server/publish-handoff.ts`
    - if missing, live publish handoff is blocked with an operator-visible error
- Existing DB migration still required:
  - `packages/db/supabase/migrations/0001_initial_schema.sql`
    - required because it creates `public.publish_jobs`
    - if missing, publish attempt persistence will fail
- Existing live render/storage dependencies still matter upstream because publish reads persisted render/assets:
  - Supabase config used by `@content-engine/db`
  - render asset persistence already depends on the existing R2/render runtime setup

Exact verification performed:
1. `.\node_modules\.bin\tsc.CMD -p packages/db/tsconfig.json`
2. `.\node_modules\.bin\tsc.CMD -p apps/web/tsconfig.json --noEmit`
3. `.\node_modules\.bin\next.CMD typegen` from `apps/web`

Exact manual verification steps:
1. Ensure `packages/db/supabase/migrations/0001_initial_schema.sql` is applied.
2. Ensure the project already has a completed render with a persisted master render asset.
3. Set `N8N_PUBLISH_WEBHOOK_URL` in the web runtime.
4. Open `/projects/[real-project-id]/publish`.
5. Confirm the page shows a real render id and a real master asset path in the payload preview.
6. Click `Send Publish Handoff`.
7. Confirm a new row appears in `public.publish_jobs` with:
   - `project_id`
   - `render_id`
   - `payload`
   - `webhook_url`
   - `status`
   - `response_payload` or `error_message`
8. Confirm the page refresh shows the latest persisted publish status.
9. Confirm the n8n webhook endpoint received the payload independently on the n8n side.

Truth status:
- Compile/type verification passed.
- A real outbound webhook path is now wired in code.
- Live webhook delivery is not claimed as verified in this turn.

Checkpoint status:
- Commit/push was not performed.
- Blocking reason: the working tree includes a suspicious untracked path that does not map cleanly to a normal repo file:
  - `ersDavidDesktopCONTENT ENGINE Xappsweb…`
- I did not guess or auto-include that path in a checkpoint commit.
