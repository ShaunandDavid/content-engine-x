-- Brand profiles for Enoch video production
create table if not exists enoch_brand_profiles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  operator_user_id uuid not null,

  -- Identity
  brand_name text not null,
  brand_tagline text,
  industry text not null,
  sub_niche text,

  -- Visual identity
  primary_color text,           -- hex e.g. #00D4FF
  secondary_color text,         -- hex
  accent_color text,            -- hex
  visual_style text,            -- e.g. "dark cinematic", "bright minimal", "gritty raw"
  logo_r2_key text,             -- R2 storage key for logo file
  hero_image_r2_key text,       -- R2 key for brand hero/anchor image (used for i2v)

  -- Voice & tone
  brand_voice text not null,    -- e.g. "authoritative", "playful", "urgent", "aspirational"
  tone_adjectives text[],       -- ["bold", "direct", "no-fluff"]
  language_level text,          -- "conversational" | "professional" | "street"

  -- Audience
  target_audience text not null,
  audience_age_range text,      -- "25-45"
  audience_pain_points text[],  -- ["wasting money on ads", "low conversion"]
  audience_desires text[],      -- ["more leads", "passive income"]

  -- Content strategy
  content_pillars text[],       -- ["education", "social proof", "behind the scenes"]
  competitor_brands text[],     -- brands to NOT look like
  reference_videos text[],      -- URLs of videos with the right vibe
  avoid_patterns text[],        -- ["talking heads only", "stock footage feel", "corporate stiff"]

  -- Performance history (updated by memory distiller)
  top_performing_hooks text[],
  top_performing_ctas text[],
  avg_qc_score float default 0,
  total_videos_produced integer default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for fast lookup by project and operator
create index if not exists idx_brand_profiles_project on enoch_brand_profiles(project_id);
create index if not exists idx_brand_profiles_operator on enoch_brand_profiles(operator_user_id);

-- Auto-update timestamp
create or replace function update_brand_profile_timestamp()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger brand_profile_updated
  before update on enoch_brand_profiles
  for each row execute function update_brand_profile_timestamp();
