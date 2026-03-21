do $$
begin
  if not exists (select 1 from pg_type where typname = 'adam_artifact_role') then
    create type adam_artifact_role as enum ('input', 'working', 'output');
  end if;

  if not exists (select 1 from pg_type where typname = 'adam_governance_outcome') then
    create type adam_governance_outcome as enum ('pending', 'approved', 'rejected', 'flagged');
  end if;
end $$;

create table if not exists public.adam_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  project_id uuid references public.projects (id) on delete set null,
  parent_run_id uuid references public.adam_runs (id) on delete set null,
  workflow_kind text not null,
  workflow_version text not null,
  entrypoint text not null,
  status job_status not null default 'pending',
  current_stage workflow_stage not null default 'brief_intake',
  requested_start_stage workflow_stage,
  state_version text not null,
  graph_thread_id text,
  input_ref text,
  output_refs text[] not null default '{}',
  state_snapshot jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.adam_artifacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  run_id uuid not null references public.adam_runs (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  artifact_type text not null,
  artifact_role adam_artifact_role not null,
  status job_status not null default 'pending',
  schema_name text not null,
  schema_version text not null,
  content_ref text,
  content_json jsonb,
  storage_provider text,
  storage_bucket text,
  storage_key text,
  checksum text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.adam_audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  run_id uuid not null references public.adam_runs (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  actor_type text not null,
  actor_id text,
  event_type text not null,
  entity_type text not null,
  entity_id text,
  stage workflow_stage,
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.adam_model_decisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  run_id uuid not null references public.adam_runs (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  stage workflow_stage not null,
  task_type text not null,
  provider text not null,
  model text not null,
  selection_reason text not null,
  fallback_of uuid references public.adam_model_decisions (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.adam_governance_decisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  run_id uuid not null references public.adam_runs (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  stage workflow_stage not null,
  decision_type text not null,
  outcome adam_governance_outcome not null,
  reason_codes text[] not null default '{}',
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_adam_runs_project_id on public.adam_runs (project_id);
create index if not exists idx_adam_runs_status_stage on public.adam_runs (status, current_stage);
create index if not exists idx_adam_runs_graph_thread_id on public.adam_runs (graph_thread_id);

create index if not exists idx_adam_artifacts_run_id on public.adam_artifacts (run_id);
create index if not exists idx_adam_artifacts_project_id on public.adam_artifacts (project_id);
create index if not exists idx_adam_artifacts_type_role on public.adam_artifacts (artifact_type, artifact_role);

create index if not exists idx_adam_audit_events_run_created on public.adam_audit_events (run_id, created_at desc);
create index if not exists idx_adam_audit_events_project_id on public.adam_audit_events (project_id);

create index if not exists idx_adam_model_decisions_run_stage on public.adam_model_decisions (run_id, stage);
create index if not exists idx_adam_model_decisions_project_id on public.adam_model_decisions (project_id);

create index if not exists idx_adam_governance_decisions_run_stage on public.adam_governance_decisions (run_id, stage);
create index if not exists idx_adam_governance_decisions_project_id on public.adam_governance_decisions (project_id);

drop trigger if exists adam_runs_set_updated_at on public.adam_runs;
create trigger adam_runs_set_updated_at before update on public.adam_runs for each row execute procedure set_updated_at();

drop trigger if exists adam_artifacts_set_updated_at on public.adam_artifacts;
create trigger adam_artifacts_set_updated_at before update on public.adam_artifacts for each row execute procedure set_updated_at();
