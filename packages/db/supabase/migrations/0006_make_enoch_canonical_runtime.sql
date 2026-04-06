create or replace function pg_temp.rename_jsonb_key(target jsonb, from_key text, to_key text)
returns jsonb
language sql
immutable
as $$
  select case
    when target is null then null
    when target ? from_key then (target - from_key) || jsonb_build_object(to_key, target -> from_key)
    else target
  end;
$$;

create or replace function pg_temp.replace_jsonb_text(target jsonb, path text[], from_value text, to_value text)
returns jsonb
language sql
immutable
as $$
  select case
    when target is null then null
    when target #>> path = from_value then jsonb_set(target, path, to_jsonb(to_value), true)
    else target
  end;
$$;

do $$
begin
  if exists (select 1 from pg_type where typname = 'adam_artifact_role')
    and not exists (select 1 from pg_type where typname = 'enoch_artifact_role') then
    alter type adam_artifact_role rename to enoch_artifact_role;
  elsif not exists (select 1 from pg_type where typname = 'enoch_artifact_role') then
    create type enoch_artifact_role as enum ('input', 'working', 'output');
  end if;

  if exists (select 1 from pg_type where typname = 'adam_governance_outcome')
    and not exists (select 1 from pg_type where typname = 'enoch_governance_outcome') then
    alter type adam_governance_outcome rename to enoch_governance_outcome;
  elsif not exists (select 1 from pg_type where typname = 'enoch_governance_outcome') then
    create type enoch_governance_outcome as enum ('pending', 'approved', 'rejected', 'flagged');
  end if;

  if exists (select 1 from pg_type where typname = 'adam_insight_category')
    and not exists (select 1 from pg_type where typname = 'enoch_insight_category') then
    alter type adam_insight_category rename to enoch_insight_category;
  elsif not exists (select 1 from pg_type where typname = 'enoch_insight_category') then
    create type enoch_insight_category as enum (
      'content_preference',
      'rejection_pattern',
      'approval_pattern',
      'audience_insight',
      'tone_preference',
      'model_performance',
      'prompt_quality',
      'platform_performance',
      'brand_voice',
      'workflow_optimization',
      'general'
    );
  end if;

  if exists (select 1 from pg_type where typname = 'adam_insight_source')
    and not exists (select 1 from pg_type where typname = 'enoch_insight_source') then
    alter type adam_insight_source rename to enoch_insight_source;
  elsif not exists (select 1 from pg_type where typname = 'enoch_insight_source') then
    create type enoch_insight_source as enum (
      'feedback_analysis',
      'approval_history',
      'rejection_history',
      'model_routing',
      'performance_data',
      'operator_instruction',
      'self_reflection'
    );
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'adam_runs'
  ) and not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'enoch_runs'
  ) then
    alter table public.adam_runs rename to enoch_runs;
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'adam_artifacts'
  ) and not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'enoch_artifacts'
  ) then
    alter table public.adam_artifacts rename to enoch_artifacts;
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'adam_audit_events'
  ) and not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'enoch_audit_events'
  ) then
    alter table public.adam_audit_events rename to enoch_audit_events;
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'adam_model_decisions'
  ) and not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'enoch_model_decisions'
  ) then
    alter table public.adam_model_decisions rename to enoch_model_decisions;
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'adam_governance_decisions'
  ) and not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'enoch_governance_decisions'
  ) then
    alter table public.adam_governance_decisions rename to enoch_governance_decisions;
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'adam_feedback_records'
  ) and not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'enoch_feedback_records'
  ) then
    alter table public.adam_feedback_records rename to enoch_feedback_records;
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'adam_brain_insights'
  ) and not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'enoch_brain_insights'
  ) then
    alter table public.adam_brain_insights rename to enoch_brain_insights;
  end if;
end $$;

create table if not exists public.enoch_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  project_id uuid references public.projects (id) on delete set null,
  parent_run_id uuid references public.enoch_runs (id) on delete set null,
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

create table if not exists public.enoch_artifacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  run_id uuid not null references public.enoch_runs (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  artifact_type text not null,
  artifact_role enoch_artifact_role not null,
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

create table if not exists public.enoch_audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  run_id uuid not null references public.enoch_runs (id) on delete cascade,
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

create table if not exists public.enoch_model_decisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  run_id uuid not null references public.enoch_runs (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  stage workflow_stage not null,
  task_type text not null,
  provider text not null,
  model text not null,
  selection_reason text not null,
  fallback_of uuid references public.enoch_model_decisions (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.enoch_governance_decisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  run_id uuid not null references public.enoch_runs (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  stage workflow_stage not null,
  decision_type text not null,
  outcome enoch_governance_outcome not null,
  reason_codes text[] not null default '{}',
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.enoch_feedback_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  project_id uuid references public.projects (id) on delete set null,
  run_id uuid references public.enoch_runs (id) on delete set null,
  artifact_id uuid references public.enoch_artifacts (id) on delete set null,
  actor_type text not null,
  actor_id text,
  feedback_category text not null,
  feedback_value text not null,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint enoch_feedback_records_has_linkage check (
    project_id is not null or run_id is not null or artifact_id is not null
  )
);

create table if not exists public.enoch_brain_insights (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  category enoch_insight_category not null,
  insight text not null,
  confidence float not null default 0.5 check (confidence >= 0.0 and confidence <= 1.0),
  source enoch_insight_source not null,
  source_project_id uuid references public.projects (id) on delete set null,
  source_run_id uuid references public.enoch_runs (id) on delete set null,
  source_feedback_id uuid references public.enoch_feedback_records (id) on delete set null,
  reinforcement_count int not null default 1,
  contradiction_count int not null default 0,
  is_active boolean not null default true,
  superseded_by uuid references public.enoch_brain_insights (id) on delete set null,
  tags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.enoch_artifacts
  alter column artifact_role type enoch_artifact_role using artifact_role::text::enoch_artifact_role;

alter table public.enoch_governance_decisions
  alter column outcome type enoch_governance_outcome using outcome::text::enoch_governance_outcome;

alter table public.enoch_brain_insights
  alter column category type enoch_insight_category using category::text::enoch_insight_category,
  alter column source type enoch_insight_source using source::text::enoch_insight_source;

do $$
begin
  if exists (
    select 1 from information_schema.tables where table_schema = 'public' and table_name = 'adam_runs'
  ) and exists (
    select 1 from information_schema.tables where table_schema = 'public' and table_name = 'enoch_runs'
  ) then
    insert into public.enoch_runs (
      id,
      tenant_id,
      project_id,
      parent_run_id,
      workflow_kind,
      workflow_version,
      entrypoint,
      status,
      current_stage,
      requested_start_stage,
      state_version,
      graph_thread_id,
      input_ref,
      output_refs,
      state_snapshot,
      error_message,
      started_at,
      completed_at,
      metadata,
      created_at,
      updated_at
    )
    select
      id,
      tenant_id,
      project_id,
      parent_run_id,
      workflow_kind,
      workflow_version,
      entrypoint,
      status,
      current_stage,
      requested_start_stage,
      state_version,
      graph_thread_id,
      input_ref,
      output_refs,
      state_snapshot,
      error_message,
      started_at,
      completed_at,
      metadata,
      created_at,
      updated_at
    from public.adam_runs
    on conflict (id) do nothing;
  end if;

  if exists (
    select 1 from information_schema.tables where table_schema = 'public' and table_name = 'adam_artifacts'
  ) and exists (
    select 1 from information_schema.tables where table_schema = 'public' and table_name = 'enoch_artifacts'
  ) then
    insert into public.enoch_artifacts (
      id,
      tenant_id,
      run_id,
      project_id,
      artifact_type,
      artifact_role,
      status,
      schema_name,
      schema_version,
      content_ref,
      content_json,
      storage_provider,
      storage_bucket,
      storage_key,
      checksum,
      error_message,
      metadata,
      created_at,
      updated_at
    )
    select
      id,
      tenant_id,
      run_id,
      project_id,
      artifact_type,
      artifact_role::text::enoch_artifact_role,
      status,
      schema_name,
      schema_version,
      content_ref,
      content_json,
      storage_provider,
      storage_bucket,
      storage_key,
      checksum,
      error_message,
      metadata,
      created_at,
      updated_at
    from public.adam_artifacts
    on conflict (id) do nothing;
  end if;

  if exists (
    select 1 from information_schema.tables where table_schema = 'public' and table_name = 'adam_audit_events'
  ) and exists (
    select 1 from information_schema.tables where table_schema = 'public' and table_name = 'enoch_audit_events'
  ) then
    insert into public.enoch_audit_events (
      id,
      tenant_id,
      run_id,
      project_id,
      actor_type,
      actor_id,
      event_type,
      entity_type,
      entity_id,
      stage,
      payload,
      error_message,
      created_at
    )
    select
      id,
      tenant_id,
      run_id,
      project_id,
      actor_type,
      actor_id,
      event_type,
      entity_type,
      entity_id,
      stage,
      payload,
      error_message,
      created_at
    from public.adam_audit_events
    on conflict (id) do nothing;
  end if;

  if exists (
    select 1 from information_schema.tables where table_schema = 'public' and table_name = 'adam_model_decisions'
  ) and exists (
    select 1 from information_schema.tables where table_schema = 'public' and table_name = 'enoch_model_decisions'
  ) then
    insert into public.enoch_model_decisions (
      id,
      tenant_id,
      run_id,
      project_id,
      stage,
      task_type,
      provider,
      model,
      selection_reason,
      fallback_of,
      metadata,
      created_at
    )
    select
      id,
      tenant_id,
      run_id,
      project_id,
      stage,
      task_type,
      provider,
      model,
      selection_reason,
      fallback_of,
      metadata,
      created_at
    from public.adam_model_decisions
    on conflict (id) do nothing;
  end if;

  if exists (
    select 1 from information_schema.tables where table_schema = 'public' and table_name = 'adam_governance_decisions'
  ) and exists (
    select 1 from information_schema.tables where table_schema = 'public' and table_name = 'enoch_governance_decisions'
  ) then
    insert into public.enoch_governance_decisions (
      id,
      tenant_id,
      run_id,
      project_id,
      stage,
      decision_type,
      outcome,
      reason_codes,
      notes,
      metadata,
      created_at
    )
    select
      id,
      tenant_id,
      run_id,
      project_id,
      stage,
      decision_type,
      outcome::text::enoch_governance_outcome,
      reason_codes,
      notes,
      metadata,
      created_at
    from public.adam_governance_decisions
    on conflict (id) do nothing;
  end if;

  if exists (
    select 1 from information_schema.tables where table_schema = 'public' and table_name = 'adam_feedback_records'
  ) and exists (
    select 1 from information_schema.tables where table_schema = 'public' and table_name = 'enoch_feedback_records'
  ) then
    insert into public.enoch_feedback_records (
      id,
      tenant_id,
      project_id,
      run_id,
      artifact_id,
      actor_type,
      actor_id,
      feedback_category,
      feedback_value,
      note,
      metadata,
      created_at
    )
    select
      id,
      tenant_id,
      project_id,
      run_id,
      artifact_id,
      actor_type,
      actor_id,
      feedback_category,
      feedback_value,
      note,
      metadata,
      created_at
    from public.adam_feedback_records
    on conflict (id) do nothing;
  end if;

  if exists (
    select 1 from information_schema.tables where table_schema = 'public' and table_name = 'adam_brain_insights'
  ) and exists (
    select 1 from information_schema.tables where table_schema = 'public' and table_name = 'enoch_brain_insights'
  ) then
    insert into public.enoch_brain_insights (
      id,
      tenant_id,
      category,
      insight,
      confidence,
      source,
      source_project_id,
      source_run_id,
      source_feedback_id,
      reinforcement_count,
      contradiction_count,
      is_active,
      superseded_by,
      tags,
      metadata,
      created_at,
      updated_at
    )
    select
      id,
      tenant_id,
      category::text::enoch_insight_category,
      insight,
      confidence,
      source::text::enoch_insight_source,
      source_project_id,
      source_run_id,
      source_feedback_id,
      reinforcement_count,
      contradiction_count,
      is_active,
      superseded_by,
      tags,
      metadata,
      created_at,
      updated_at
    from public.adam_brain_insights
    on conflict (id) do nothing;
  end if;
end $$;

alter index if exists public.idx_adam_runs_project_id rename to idx_enoch_runs_project_id;
alter index if exists public.idx_adam_runs_status_stage rename to idx_enoch_runs_status_stage;
alter index if exists public.idx_adam_runs_graph_thread_id rename to idx_enoch_runs_graph_thread_id;
alter index if exists public.idx_adam_artifacts_run_id rename to idx_enoch_artifacts_run_id;
alter index if exists public.idx_adam_artifacts_project_id rename to idx_enoch_artifacts_project_id;
alter index if exists public.idx_adam_artifacts_type_role rename to idx_enoch_artifacts_type_role;
alter index if exists public.idx_adam_audit_events_run_created rename to idx_enoch_audit_events_run_created;
alter index if exists public.idx_adam_audit_events_project_id rename to idx_enoch_audit_events_project_id;
alter index if exists public.idx_adam_model_decisions_run_stage rename to idx_enoch_model_decisions_run_stage;
alter index if exists public.idx_adam_model_decisions_project_id rename to idx_enoch_model_decisions_project_id;
alter index if exists public.idx_adam_governance_decisions_run_stage rename to idx_enoch_governance_decisions_run_stage;
alter index if exists public.idx_adam_governance_decisions_project_id rename to idx_enoch_governance_decisions_project_id;
alter index if exists public.idx_adam_feedback_records_project_id rename to idx_enoch_feedback_records_project_id;
alter index if exists public.idx_adam_feedback_records_run_id rename to idx_enoch_feedback_records_run_id;
alter index if exists public.idx_adam_feedback_records_artifact_id rename to idx_enoch_feedback_records_artifact_id;
alter index if exists public.idx_adam_brain_active_category rename to idx_enoch_brain_active_category;
alter index if exists public.idx_adam_brain_confidence rename to idx_enoch_brain_confidence;
alter index if exists public.idx_adam_brain_tenant rename to idx_enoch_brain_tenant;
alter index if exists public.idx_adam_brain_source_project rename to idx_enoch_brain_source_project;
alter index if exists public.idx_adam_brain_tags rename to idx_enoch_brain_tags;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'adam_feedback_records_has_linkage')
    and exists (
      select 1
      from information_schema.tables
      where table_schema = 'public' and table_name = 'enoch_feedback_records'
    ) then
    alter table public.enoch_feedback_records
      rename constraint adam_feedback_records_has_linkage to enoch_feedback_records_has_linkage;
  end if;
end $$;

create index if not exists idx_enoch_runs_project_id on public.enoch_runs (project_id);
create index if not exists idx_enoch_runs_status_stage on public.enoch_runs (status, current_stage);
create index if not exists idx_enoch_runs_graph_thread_id on public.enoch_runs (graph_thread_id);

create index if not exists idx_enoch_artifacts_run_id on public.enoch_artifacts (run_id);
create index if not exists idx_enoch_artifacts_project_id on public.enoch_artifacts (project_id);
create index if not exists idx_enoch_artifacts_type_role on public.enoch_artifacts (artifact_type, artifact_role);

create index if not exists idx_enoch_audit_events_run_created on public.enoch_audit_events (run_id, created_at desc);
create index if not exists idx_enoch_audit_events_project_id on public.enoch_audit_events (project_id);

create index if not exists idx_enoch_model_decisions_run_stage on public.enoch_model_decisions (run_id, stage);
create index if not exists idx_enoch_model_decisions_project_id on public.enoch_model_decisions (project_id);

create index if not exists idx_enoch_governance_decisions_run_stage on public.enoch_governance_decisions (run_id, stage);
create index if not exists idx_enoch_governance_decisions_project_id on public.enoch_governance_decisions (project_id);

create index if not exists idx_enoch_feedback_records_project_id
  on public.enoch_feedback_records (project_id, created_at desc);

create index if not exists idx_enoch_feedback_records_run_id
  on public.enoch_feedback_records (run_id, created_at desc);

create index if not exists idx_enoch_feedback_records_artifact_id
  on public.enoch_feedback_records (artifact_id, created_at desc);

create index if not exists idx_enoch_brain_active_category
  on public.enoch_brain_insights (is_active, category)
  where is_active = true;

create index if not exists idx_enoch_brain_confidence
  on public.enoch_brain_insights (confidence desc)
  where is_active = true;

create index if not exists idx_enoch_brain_tenant
  on public.enoch_brain_insights (tenant_id)
  where is_active = true;

create index if not exists idx_enoch_brain_source_project
  on public.enoch_brain_insights (source_project_id)
  where source_project_id is not null;

create index if not exists idx_enoch_brain_tags
  on public.enoch_brain_insights using gin (tags);

drop trigger if exists adam_runs_set_updated_at on public.enoch_runs;
drop trigger if exists enoch_runs_set_updated_at on public.enoch_runs;
create trigger enoch_runs_set_updated_at before update on public.enoch_runs for each row execute procedure set_updated_at();

drop trigger if exists adam_artifacts_set_updated_at on public.enoch_artifacts;
drop trigger if exists enoch_artifacts_set_updated_at on public.enoch_artifacts;
create trigger enoch_artifacts_set_updated_at before update on public.enoch_artifacts for each row execute procedure set_updated_at();

drop trigger if exists adam_brain_insights_set_updated_at on public.enoch_brain_insights;
drop trigger if exists enoch_brain_insights_set_updated_at on public.enoch_brain_insights;
create trigger enoch_brain_insights_set_updated_at
  before update on public.enoch_brain_insights
  for each row execute procedure set_updated_at();

update public.projects
set metadata = pg_temp.replace_jsonb_text(
  pg_temp.replace_jsonb_text(metadata, array['source'], 'adam_text_loop', 'enoch_text_loop'),
  array['source'],
  'content_engine_x_adam_bridge',
  'content_engine_x_enoch_bridge'
)
where metadata ->> 'source' in ('adam_text_loop', 'content_engine_x_adam_bridge');

update public.briefs
set metadata = pg_temp.replace_jsonb_text(
  pg_temp.replace_jsonb_text(metadata, array['source'], 'adam_text_loop', 'enoch_text_loop'),
  array['source'],
  'content_engine_x_adam_bridge',
  'content_engine_x_enoch_bridge'
)
where metadata ->> 'source' in ('adam_text_loop', 'content_engine_x_adam_bridge');

update public.workflow_runs
set metadata = pg_temp.replace_jsonb_text(
  pg_temp.replace_jsonb_text(metadata, array['source'], 'adam_text_loop', 'enoch_text_loop'),
  array['source'],
  'content_engine_x_adam_bridge',
  'content_engine_x_enoch_bridge'
)
where metadata ->> 'source' in ('adam_text_loop', 'content_engine_x_adam_bridge');

update public.workflow_runs
set state_snapshot = pg_temp.rename_jsonb_key(
  pg_temp.rename_jsonb_key(
    pg_temp.rename_jsonb_key(
      pg_temp.rename_jsonb_key(state_snapshot, 'adam_preplan', 'enoch_preplan'),
      'adam_reasoning',
      'enoch_reasoning'
    ),
    'adam_plan',
    'enoch_plan'
  ),
  'adam_preplan_status',
  'enoch_preplan_status'
)
where state_snapshot ?| array['adam_preplan', 'adam_reasoning', 'adam_plan', 'adam_preplan_status'];

update public.workflow_runs
set state_snapshot = pg_temp.replace_jsonb_text(
  pg_temp.replace_jsonb_text(
    pg_temp.replace_jsonb_text(
      pg_temp.replace_jsonb_text(
        pg_temp.replace_jsonb_text(
          pg_temp.replace_jsonb_text(
            pg_temp.replace_jsonb_text(
              pg_temp.replace_jsonb_text(
                pg_temp.replace_jsonb_text(
                  state_snapshot,
                  array['workflow_kind'],
                  'adam.text_planning',
                  'enoch.text_planning'
                ),
                array['workflow_kind'],
                'adam.content_engine_x_preplan',
                'enoch.content_engine_x_preplan'
              ),
              array['state_version'],
              'adam.phase0.v1',
              'enoch.phase0.v1'
            ),
            array['state_version'],
            'adam.phase2.reasoning_mvp.v1',
            'enoch.phase2.reasoning_mvp.v1'
          ),
          array['entrypoint'],
          'adam_text_plan',
          'enoch_text_plan'
        ),
        array['metadata', 'source'],
        'adam_text_loop',
        'enoch_text_loop'
      ),
      array['metadata', 'source'],
      'content_engine_x_adam_bridge',
      'content_engine_x_enoch_bridge'
    ),
    array['enoch_preplan', 'workflow_kind'],
    'adam.content_engine_x_preplan',
    'enoch.content_engine_x_preplan'
  ),
  array['enoch_plan', 'metadata', 'source'],
  'adam_text_loop',
  'enoch_text_loop'
)
where state_snapshot::text ~ 'adam';

update public.workflow_runs
set state_snapshot = pg_temp.replace_jsonb_text(
  pg_temp.replace_jsonb_text(
    pg_temp.replace_jsonb_text(
      state_snapshot,
      array['enoch_plan', 'metadata', 'source'],
      'content_engine_x_adam_bridge',
      'content_engine_x_enoch_bridge'
    ),
    array['enoch_plan', 'metadata', 'workflowKind'],
    'adam.text_planning',
    'enoch.text_planning'
  ),
  array['enoch_plan', 'metadata', 'workflowKind'],
  'adam.content_engine_x_preplan',
  'enoch.content_engine_x_preplan'
)
where state_snapshot::text ~ 'adam';

update public.audit_logs
set action = case action
    when 'adam.reasoning.completed' then 'enoch.reasoning.completed'
    when 'adam.plan.generated' then 'enoch.plan.generated'
    when 'adam.preplan.completed' then 'enoch.preplan.completed'
    when 'adam.preplan.skipped' then 'enoch.preplan.skipped'
    else action
  end,
  entity_type = case entity_type
    when 'adam_reasoning' then 'enoch_reasoning'
    when 'adam_plan' then 'enoch_plan'
    when 'adam_run' then 'enoch_run'
    else entity_type
  end,
  metadata = pg_temp.replace_jsonb_text(
    pg_temp.replace_jsonb_text(metadata, array['source'], 'adam_text_loop', 'enoch_text_loop'),
    array['source'],
    'content_engine_x_adam_bridge',
    'content_engine_x_enoch_bridge'
  )
where action in (
    'adam.reasoning.completed',
    'adam.plan.generated',
    'adam.preplan.completed',
    'adam.preplan.skipped'
  )
  or entity_type in ('adam_reasoning', 'adam_plan', 'adam_run')
  or metadata ->> 'source' in ('adam_text_loop', 'content_engine_x_adam_bridge');

update public.enoch_runs
set workflow_kind = case workflow_kind
    when 'adam.text_planning' then 'enoch.text_planning'
    when 'adam.content_engine_x_preplan' then 'enoch.content_engine_x_preplan'
    else workflow_kind
  end,
  state_version = case state_version
    when 'adam.phase0.v1' then 'enoch.phase0.v1'
    when 'adam.phase2.reasoning_mvp.v1' then 'enoch.phase2.reasoning_mvp.v1'
    when 'adam.phase3.content_engine_preplan.v1' then 'enoch.phase3.content_engine_preplan.v1'
    else state_version
  end,
  entrypoint = case entrypoint
    when 'adam_text_plan' then 'enoch_text_plan'
    else entrypoint
  end,
  metadata = pg_temp.replace_jsonb_text(
    pg_temp.replace_jsonb_text(metadata, array['source'], 'adam_text_loop', 'enoch_text_loop'),
    array['source'],
    'content_engine_x_adam_bridge',
    'content_engine_x_enoch_bridge'
  )
where workflow_kind in ('adam.text_planning', 'adam.content_engine_x_preplan')
  or state_version in ('adam.phase0.v1', 'adam.phase2.reasoning_mvp.v1', 'adam.phase3.content_engine_preplan.v1')
  or entrypoint = 'adam_text_plan'
  or metadata ->> 'source' in ('adam_text_loop', 'content_engine_x_adam_bridge');

update public.enoch_runs
set state_snapshot = pg_temp.replace_jsonb_text(
  pg_temp.replace_jsonb_text(
    pg_temp.replace_jsonb_text(
      pg_temp.replace_jsonb_text(
        pg_temp.replace_jsonb_text(
          pg_temp.replace_jsonb_text(
            pg_temp.replace_jsonb_text(
              state_snapshot,
              array['stateVersion'],
              'adam.phase0.v1',
              'enoch.phase0.v1'
            ),
            array['stateVersion'],
            'adam.phase2.reasoning_mvp.v1',
            'enoch.phase2.reasoning_mvp.v1'
          ),
          array['stateVersion'],
          'adam.phase3.content_engine_preplan.v1',
          'enoch.phase3.content_engine_preplan.v1'
        ),
        array['workflowKind'],
        'adam.text_planning',
        'enoch.text_planning'
      ),
      array['workflowKind'],
      'adam.content_engine_x_preplan',
      'enoch.content_engine_x_preplan'
    ),
    array['entrypoint'],
    'adam_text_plan',
    'enoch_text_plan'
  ),
  array['metadata', 'source'],
  'adam_text_loop',
  'enoch_text_loop'
)
where state_snapshot::text ~ 'adam';

update public.enoch_runs
set state_snapshot = pg_temp.replace_jsonb_text(
  pg_temp.replace_jsonb_text(
    pg_temp.replace_jsonb_text(
      state_snapshot,
      array['metadata', 'source'],
      'content_engine_x_adam_bridge',
      'content_engine_x_enoch_bridge'
    ),
    array['workingMemory', 'enochPlan', 'metadata', 'source'],
    'adam_text_loop',
    'enoch_text_loop'
  ),
  array['workingMemory', 'enochPlan', 'metadata', 'source'],
  'content_engine_x_adam_bridge',
  'content_engine_x_enoch_bridge'
)
where state_snapshot::text ~ 'adam';

update public.enoch_runs
set state_snapshot = pg_temp.replace_jsonb_text(
  pg_temp.replace_jsonb_text(
    state_snapshot,
    array['workingMemory', 'enochPlan', 'metadata', 'workflowKind'],
    'adam.text_planning',
    'enoch.text_planning'
  ),
  array['workingMemory', 'enochPlan', 'metadata', 'workflowKind'],
  'adam.content_engine_x_preplan',
  'enoch.content_engine_x_preplan'
)
where state_snapshot::text ~ 'adam';

update public.enoch_artifacts
set schema_name = case schema_name
    when 'adam.text-planning-input' then 'enoch.text-planning-input'
    when 'adam.planning-artifact' then 'enoch.planning-artifact'
    when 'adam.reasoning-artifact' then 'enoch.reasoning-artifact'
    else schema_name
  end,
  metadata = pg_temp.replace_jsonb_text(
    pg_temp.replace_jsonb_text(metadata, array['source'], 'adam_text_loop', 'enoch_text_loop'),
    array['source'],
    'content_engine_x_adam_bridge',
    'content_engine_x_enoch_bridge'
  )
where schema_name in ('adam.text-planning-input', 'adam.planning-artifact', 'adam.reasoning-artifact')
  or metadata ->> 'source' in ('adam_text_loop', 'content_engine_x_adam_bridge');

update public.enoch_artifacts
set content_json = pg_temp.replace_jsonb_text(
  pg_temp.replace_jsonb_text(
    pg_temp.replace_jsonb_text(
      pg_temp.replace_jsonb_text(
        content_json,
        array['metadata', 'source'],
        'adam_text_loop',
        'enoch_text_loop'
      ),
      array['metadata', 'source'],
      'content_engine_x_adam_bridge',
      'content_engine_x_enoch_bridge'
    ),
    array['metadata', 'workflowKind'],
    'adam.text_planning',
    'enoch.text_planning'
  ),
  array['metadata', 'workflowKind'],
  'adam.content_engine_x_preplan',
  'enoch.content_engine_x_preplan'
)
where content_json::text ~ 'adam';

update public.enoch_model_decisions
set metadata = pg_temp.replace_jsonb_text(metadata, array['source'], 'adam_text_loop_router', 'enoch_text_loop_router')
where metadata ->> 'source' = 'adam_text_loop_router';

update public.enoch_feedback_records
set metadata = pg_temp.replace_jsonb_text(
  pg_temp.replace_jsonb_text(metadata, array['source'], 'adam_text_loop', 'enoch_text_loop'),
  array['source'],
  'content_engine_x_adam_bridge',
  'content_engine_x_enoch_bridge'
)
where metadata ->> 'source' in ('adam_text_loop', 'content_engine_x_adam_bridge');

update public.enoch_brain_insights
set metadata = pg_temp.replace_jsonb_text(
  pg_temp.replace_jsonb_text(metadata, array['source'], 'adam_text_loop', 'enoch_text_loop'),
  array['source'],
  'content_engine_x_adam_bridge',
  'content_engine_x_enoch_bridge'
)
where metadata ->> 'source' in ('adam_text_loop', 'content_engine_x_adam_bridge');

update public.enoch_audit_events
set event_type = case event_type
    when 'adam.reasoning.completed' then 'enoch.reasoning.completed'
    when 'adam.plan.generated' then 'enoch.plan.generated'
    when 'adam.preplan.reasoning_completed' then 'enoch.preplan.reasoning_completed'
    when 'adam.preplan.planning_completed' then 'enoch.preplan.planning_completed'
    when 'adam.preplan.completed' then 'enoch.preplan.completed'
    when 'adam.preplan.skipped' then 'enoch.preplan.skipped'
    else event_type
  end,
  entity_type = case entity_type
    when 'adam_reasoning' then 'enoch_reasoning'
    when 'adam_plan' then 'enoch_plan'
    when 'adam_run' then 'enoch_run'
    else entity_type
  end,
  payload = pg_temp.replace_jsonb_text(
    pg_temp.replace_jsonb_text(
      pg_temp.replace_jsonb_text(payload, array['source'], 'adam_text_loop', 'enoch_text_loop'),
      array['source'],
      'content_engine_x_adam_bridge',
      'content_engine_x_enoch_bridge'
    ),
    array['metadata', 'source'],
    'adam_text_loop',
    'enoch_text_loop'
  )
where event_type in (
    'adam.reasoning.completed',
    'adam.plan.generated',
    'adam.preplan.reasoning_completed',
    'adam.preplan.planning_completed',
    'adam.preplan.completed',
    'adam.preplan.skipped'
  )
  or entity_type in ('adam_reasoning', 'adam_plan', 'adam_run')
  or payload::text ~ 'adam';
