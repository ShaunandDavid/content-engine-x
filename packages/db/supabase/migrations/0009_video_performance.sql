-- Video performance tracking — feeds back into enoch_brain_insights
create table if not exists enoch_video_performance (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  run_id uuid,

  -- Publishing metadata
  platform text not null,          -- "tiktok" | "instagram_reels" | "youtube_shorts"
  published_url text,
  published_at timestamptz,

  -- Performance metrics (populated after publishing, updated periodically)
  views integer default 0,
  likes integer default 0,
  shares integer default 0,
  comments integer default 0,
  saves integer default 0,
  watch_time_seconds float default 0,
  completion_rate float default 0,   -- 0.0-1.0: what % watched to the end
  click_through_rate float default 0,

  -- Viral signal
  went_viral boolean default false,  -- true if views > 100k in 48 hours
  viral_at timestamptz,              -- when it crossed the threshold

  -- What Enoch used to make it (snapshot for attribution)
  viral_framework text,
  hook_text text,                    -- the actual hook that was used
  concept_title text,
  motion_scores integer[],
  brand_name text,
  primary_color text,

  -- Learning status
  feedback_distilled boolean default false,  -- has memory_distiller processed this?
  distilled_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Unique constraint for upsert on project+platform
  unique (project_id, platform)
);

create index if not exists idx_video_performance_project on enoch_video_performance(project_id);
create index if not exists idx_video_performance_platform on enoch_video_performance(platform);
create index if not exists idx_video_performance_viral on enoch_video_performance(went_viral, views desc);
create index if not exists idx_video_performance_undistilled on enoch_video_performance(feedback_distilled) where feedback_distilled = false;

-- Auto-update timestamp (reuses function from 0008_brand_profiles.sql)
create trigger video_performance_updated
  before update on enoch_video_performance
  for each row execute function update_brand_profile_timestamp();
