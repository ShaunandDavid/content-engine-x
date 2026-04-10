create table if not exists public.enoch_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references public.users (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  title text not null,
  generated_label text,
  summary text,
  context_snapshot jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  last_message_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.enoch_chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.enoch_chat_sessions (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  role text not null check (role in ('system', 'user', 'assistant')),
  kind text not null default 'message' check (kind in ('message', 'scene_bundle', 'event')),
  content text not null default '',
  attachments jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_enoch_chat_sessions_project
  on public.enoch_chat_sessions (project_id, updated_at desc);

create index if not exists idx_enoch_chat_sessions_updated
  on public.enoch_chat_sessions (updated_at desc);

create index if not exists idx_enoch_chat_messages_session
  on public.enoch_chat_messages (session_id, created_at asc);

create index if not exists idx_enoch_chat_messages_project
  on public.enoch_chat_messages (project_id, created_at desc);

drop trigger if exists enoch_chat_sessions_set_updated_at on public.enoch_chat_sessions;
create trigger enoch_chat_sessions_set_updated_at
  before update on public.enoch_chat_sessions
  for each row
  execute procedure set_updated_at();
