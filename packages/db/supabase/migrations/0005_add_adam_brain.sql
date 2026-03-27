-- Adam Brain: cross-project intelligence layer
-- Project memory = what happened per project (adam_runs, adam_artifacts, adam_feedback_records)
-- Adam Brain = what Adam LEARNED across all projects (this table)

do $
begin
  if not exists (select 1 from pg_type where typname = 'adam_insight_category') then
    create type adam_insight_category as enum (
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

  if not exists (select 1 from pg_type where typname = 'adam_insight_source') then
    create type adam_insight_source as enum (
      'feedback_analysis',
      'approval_history',
      'rejection_history',
      'model_routing',
      'performance_data',
      'operator_instruction',
      'self_reflection'
    );
  end if;
end $;

create table if not exists public.adam_brain_insights (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,

  -- What Adam learned
  category adam_insight_category not null,
  insight text not null,
  confidence float not null default 0.5 check (confidence >= 0.0 and confidence <= 1.0),

  -- Where Adam learned it from
  source adam_insight_source not null,
  source_project_id uuid references public.projects (id) on delete set null,
  source_run_id uuid references public.adam_runs (id) on delete set null,
  source_feedback_id uuid references public.adam_feedback_records (id) on delete set null,

  -- How many times this insight has been reinforced or contradicted
  reinforcement_count int not null default 1,
  contradiction_count int not null default 0,

  -- Whether this insight is active (Adam uses it) or retired (superseded/wrong)
  is_active boolean not null default true,
  superseded_by uuid references public.adam_brain_insights (id) on delete set null,

  -- Tagging for fast retrieval
  tags text[] not null default '{}',

  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Indexes for how Adam reads his brain
create index if not exists idx_adam_brain_active_category
  on public.adam_brain_insights (is_active, category)
  where is_active = true;

create index if not exists idx_adam_brain_confidence
  on public.adam_brain_insights (confidence desc)
  where is_active = true;

create index if not exists idx_adam_brain_tenant
  on public.adam_brain_insights (tenant_id)
  where is_active = true;

create index if not exists idx_adam_brain_source_project
  on public.adam_brain_insights (source_project_id)
  where source_project_id is not null;

create index if not exists idx_adam_brain_tags
  on public.adam_brain_insights using gin (tags);

-- Auto-update timestamp
drop trigger if exists adam_brain_insights_set_updated_at on public.adam_brain_insights;
create trigger adam_brain_insights_set_updated_at
  before update on public.adam_brain_insights
  for each row execute procedure set_updated_at();
