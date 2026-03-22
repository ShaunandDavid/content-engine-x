create table if not exists public.adam_feedback_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  project_id uuid references public.projects (id) on delete set null,
  run_id uuid references public.adam_runs (id) on delete set null,
  artifact_id uuid references public.adam_artifacts (id) on delete set null,
  actor_type text not null,
  actor_id text,
  feedback_category text not null,
  feedback_value text not null,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint adam_feedback_records_has_linkage check (
    project_id is not null or run_id is not null or artifact_id is not null
  )
);

create index if not exists idx_adam_feedback_records_project_id
  on public.adam_feedback_records (project_id, created_at desc);

create index if not exists idx_adam_feedback_records_run_id
  on public.adam_feedback_records (run_id, created_at desc);

create index if not exists idx_adam_feedback_records_artifact_id
  on public.adam_feedback_records (artifact_id, created_at desc);
