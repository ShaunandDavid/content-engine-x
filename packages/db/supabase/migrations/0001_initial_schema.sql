create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'provider_name') then
    create type provider_name as enum ('sora');
  end if;

  if not exists (select 1 from pg_type where typname = 'project_tone') then
    create type project_tone as enum ('educational', 'authority', 'energetic', 'playful', 'cinematic');
  end if;

  if not exists (select 1 from pg_type where typname = 'platform_name') then
    create type platform_name as enum ('tiktok', 'instagram_reels', 'youtube_shorts', 'linkedin');
  end if;

  if not exists (select 1 from pg_type where typname = 'job_status') then
    create type job_status as enum ('pending', 'queued', 'running', 'awaiting_approval', 'approved', 'completed', 'failed', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'approval_status') then
    create type approval_status as enum ('pending', 'approved', 'rejected');
  end if;

  if not exists (select 1 from pg_type where typname = 'workflow_stage') then
    create type workflow_stage as enum (
      'brief_intake',
      'concept_generation',
      'scene_planning',
      'prompt_creation',
      'clip_generation',
      'qc_decision',
      'render_assembly',
      'asset_persistence',
      'publish_payload'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'asset_kind') then
    create type asset_kind as enum ('source_video', 'render_video', 'thumbnail', 'caption_file', 'logo', 'end_card', 'music_bed');
  end if;
end $$;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  display_name text,
  role text not null default 'operator',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users (id) on delete restrict,
  name text not null,
  slug text not null unique,
  status job_status not null default 'pending',
  current_stage workflow_stage not null default 'brief_intake',
  tone project_tone not null,
  duration_seconds integer not null check (duration_seconds in (15, 20, 30)),
  aspect_ratio text not null,
  provider provider_name not null default 'sora',
  platform_targets platform_name[] not null,
  metadata jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.briefs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  author_user_id uuid not null references public.users (id) on delete restrict,
  status job_status not null default 'pending',
  raw_brief text not null,
  objective text not null,
  audience text not null,
  constraints jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.scenes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  ordinal integer not null check (ordinal > 0),
  title text not null,
  narration text not null,
  visual_beat text not null,
  duration_seconds integer not null check (duration_seconds > 0),
  aspect_ratio text not null,
  status job_status not null default 'pending',
  approval_status approval_status not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (project_id, ordinal)
);

create table if not exists public.prompts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  scene_id uuid references public.scenes (id) on delete cascade,
  stage workflow_stage not null,
  version integer not null check (version > 0),
  provider provider_name not null,
  model text not null,
  status job_status not null default 'pending',
  system_prompt text not null,
  user_prompt text not null,
  compiled_prompt text not null,
  metadata jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (scene_id, stage, version)
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  scene_id uuid references public.scenes (id) on delete cascade,
  render_id uuid,
  clip_id uuid,
  kind asset_kind not null,
  storage_provider text not null default 'r2',
  bucket text not null,
  object_key text not null,
  public_url text,
  mime_type text not null,
  byte_size bigint,
  checksum text,
  status job_status not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.clips (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  scene_id uuid not null references public.scenes (id) on delete cascade,
  prompt_id uuid not null references public.prompts (id) on delete restrict,
  provider provider_name not null,
  provider_job_id text,
  requested_duration_seconds integer not null check (requested_duration_seconds > 0),
  actual_duration_seconds integer,
  aspect_ratio text not null,
  source_asset_id uuid references public.assets (id) on delete set null,
  thumbnail_asset_id uuid references public.assets (id) on delete set null,
  status job_status not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.renders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  status job_status not null default 'pending',
  aspect_ratio text not null,
  duration_seconds integer,
  master_asset_id uuid references public.assets (id) on delete set null,
  thumbnail_asset_id uuid references public.assets (id) on delete set null,
  caption_asset_id uuid references public.assets (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'assets_render_id_fkey') then
    alter table public.assets
      add constraint assets_render_id_fkey
      foreign key (render_id) references public.renders (id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'assets_clip_id_fkey') then
    alter table public.assets
      add constraint assets_clip_id_fkey
      foreign key (clip_id) references public.clips (id) on delete cascade;
  end if;
end $$;

create table if not exists public.publish_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  render_id uuid not null references public.renders (id) on delete cascade,
  status job_status not null default 'pending',
  title text not null,
  caption text not null,
  hashtags text[] not null default '{}',
  platforms platform_name[] not null,
  webhook_url text not null,
  scheduled_publish_time timestamptz,
  payload jsonb not null default '{}'::jsonb,
  response_payload jsonb,
  metadata jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  parent_run_id uuid references public.workflow_runs (id) on delete set null,
  status job_status not null default 'pending',
  current_stage workflow_stage not null default 'brief_intake',
  requested_stage workflow_stage,
  graph_thread_id text,
  rerun_from_stage workflow_stage,
  retry_count integer not null default 0,
  state_snapshot jsonb not null default '{}'::jsonb,
  stage_attempts jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  workflow_run_id uuid references public.workflow_runs (id) on delete cascade,
  actor_user_id uuid references public.users (id) on delete set null,
  actor_type text not null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  stage workflow_stage,
  diff jsonb,
  metadata jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_projects_owner_user_id on public.projects (owner_user_id);
create index if not exists idx_briefs_project_id on public.briefs (project_id);
create index if not exists idx_scenes_project_id on public.scenes (project_id);
create index if not exists idx_prompts_project_scene on public.prompts (project_id, scene_id);
create index if not exists idx_clips_project_scene on public.clips (project_id, scene_id);
create index if not exists idx_assets_project_kind on public.assets (project_id, kind);
create index if not exists idx_renders_project_id on public.renders (project_id);
create index if not exists idx_publish_jobs_project_id on public.publish_jobs (project_id);
create index if not exists idx_workflow_runs_project_stage on public.workflow_runs (project_id, current_stage);
create index if not exists idx_audit_logs_project_run on public.audit_logs (project_id, workflow_run_id);

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at before update on public.users for each row execute procedure set_updated_at();

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at before update on public.projects for each row execute procedure set_updated_at();

drop trigger if exists briefs_set_updated_at on public.briefs;
create trigger briefs_set_updated_at before update on public.briefs for each row execute procedure set_updated_at();

drop trigger if exists scenes_set_updated_at on public.scenes;
create trigger scenes_set_updated_at before update on public.scenes for each row execute procedure set_updated_at();

drop trigger if exists prompts_set_updated_at on public.prompts;
create trigger prompts_set_updated_at before update on public.prompts for each row execute procedure set_updated_at();

drop trigger if exists assets_set_updated_at on public.assets;
create trigger assets_set_updated_at before update on public.assets for each row execute procedure set_updated_at();

drop trigger if exists clips_set_updated_at on public.clips;
create trigger clips_set_updated_at before update on public.clips for each row execute procedure set_updated_at();

drop trigger if exists renders_set_updated_at on public.renders;
create trigger renders_set_updated_at before update on public.renders for each row execute procedure set_updated_at();

drop trigger if exists publish_jobs_set_updated_at on public.publish_jobs;
create trigger publish_jobs_set_updated_at before update on public.publish_jobs for each row execute procedure set_updated_at();

drop trigger if exists workflow_runs_set_updated_at on public.workflow_runs;
create trigger workflow_runs_set_updated_at before update on public.workflow_runs for each row execute procedure set_updated_at();

drop trigger if exists audit_logs_set_updated_at on public.audit_logs;
create trigger audit_logs_set_updated_at before update on public.audit_logs for each row execute procedure set_updated_at();
