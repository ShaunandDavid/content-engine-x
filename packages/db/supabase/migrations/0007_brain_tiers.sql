-- Migration: 0007_brain_tiers.sql
-- Extends enoch_brain_insights with tiered memory metadata, admission scores,
-- retrieval access tracking, and automatic episodic -> semantic promotion.

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'enoch_memory_tier'
  ) then
    create type enoch_memory_tier as enum (
      'working',
      'episodic',
      'semantic'
    );
  end if;
end $$;

alter table public.enoch_brain_insights
  add column if not exists memory_tier enoch_memory_tier not null default 'episodic',
  add column if not exists admission_score jsonb,
  add column if not exists access_count integer not null default 0,
  add column if not exists last_accessed_at timestamptz,
  add column if not exists source_stage workflow_stage,
  add column if not exists distiller_version text not null default '1.0';

comment on column public.enoch_brain_insights.admission_score is
  'A-MAC admission scores: {future_utility, confidence, novelty, relevance, recency_weight, composite}.';

comment on column public.enoch_brain_insights.source_stage is
  'Pipeline stage that generated the insight (concept_generation, prompt_creation, etc.).';

create or replace function public.promote_to_semantic_tier()
returns trigger
language plpgsql
as $$
begin
  if new.reinforcement_count >= 3 and new.memory_tier = 'episodic' then
    new.memory_tier := 'semantic';
  end if;
  return new;
end;
$$;

drop trigger if exists tier_promotion_trigger on public.enoch_brain_insights;
create trigger tier_promotion_trigger
  before insert or update on public.enoch_brain_insights
  for each row execute function public.promote_to_semantic_tier();

create or replace function public.decay_stale_insights(
  days_inactive integer default 30,
  decay_factor double precision default 0.05
)
returns integer
language plpgsql
as $$
declare
  updated_count integer;
begin
  update public.enoch_brain_insights
  set confidence = greatest(confidence - decay_factor, 0.10)
  where
    memory_tier = 'episodic'
    and (
      (last_accessed_at is null and created_at < now() - make_interval(days => days_inactive))
      or (last_accessed_at < now() - make_interval(days => days_inactive))
    );

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

comment on function public.decay_stale_insights(integer, double precision) is
  'Decays confidence on episodic insights that have not been accessed recently. Suggested weekly schedule: select public.decay_stale_insights(30, 0.05);';

create or replace function public.increment_insight_access(insight_id uuid)
returns void
language plpgsql
as $$
begin
  update public.enoch_brain_insights
  set
    access_count = access_count + 1,
    last_accessed_at = now()
  where id = insight_id;
end;
$$;

create index if not exists idx_enoch_brain_memory_tier
  on public.enoch_brain_insights (memory_tier);

create index if not exists idx_enoch_brain_category_confidence
  on public.enoch_brain_insights (category, confidence desc);

create index if not exists idx_enoch_brain_project_stage
  on public.enoch_brain_insights (source_project_id, source_stage);

create index if not exists idx_enoch_brain_reinforcement_confidence
  on public.enoch_brain_insights (reinforcement_count desc, confidence desc);

create index if not exists idx_enoch_brain_access
  on public.enoch_brain_insights (last_accessed_at nulls first, access_count);

update public.enoch_brain_insights
set
  admission_score = coalesce(
    admission_score,
    '{"future_utility": 0.70, "confidence": 0.70, "novelty": 0.70, "relevance": 0.70, "recency_weight": 0.70, "composite": 0.70}'::jsonb
  ),
  memory_tier = case
    when reinforcement_count >= 3 then 'semantic'::enoch_memory_tier
    else 'episodic'::enoch_memory_tier
  end,
  distiller_version = coalesce(distiller_version, '1.0');
