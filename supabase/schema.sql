create extension if not exists pgcrypto;

create table if not exists public.translate_projects (
  id uuid primary key default gen_random_uuid(),
  share_id text not null unique,
  owner_token text not null unique,
  title text not null,
  original_filename text not null,
  playback_path text not null,
  workspace_id uuid,
  client_name text,
  client_email text,
  brand_name text,
  brand_accent text not null default '#d6a15f',
  status text not null default 'in_review'
    check (status in ('draft', 'in_review', 'changes_requested', 'approved', 'final_delivered')),
  version_label text not null default 'Version 1',
  due_at timestamptz,
  download_enabled boolean not null default false,
  link_expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists translate_projects_created_at_idx
on public.translate_projects (created_at desc);

create index if not exists translate_projects_workspace_status_idx
on public.translate_projects (workspace_id, status, created_at desc);

create table if not exists public.video_annotations (
  id uuid primary key default gen_random_uuid(),
  share_id text not null,
  session_id text not null,
  timestamp_ms integer not null check (timestamp_ms >= 0),
  timestamp_bucket integer not null check (timestamp_bucket >= 0),
  annotation_type text not null check (annotation_type in ('pen', 'circle', 'arrow')),
  canvas_width integer not null check (canvas_width > 0),
  canvas_height integer not null check (canvas_height > 0),
  payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists video_annotations_share_bucket_idx
on public.video_annotations (share_id, timestamp_bucket, created_at);

create table if not exists public.timestamped_notes (
  id uuid primary key default gen_random_uuid(),
  share_id text not null,
  session_id text not null,
  timestamp_seconds double precision not null check (timestamp_seconds >= 0),
  note_text text not null,
  ai_translation jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.timestamped_notes add column if not exists ai_translation jsonb;

create index if not exists timestamped_notes_share_timestamp_idx
on public.timestamped_notes (share_id, timestamp_seconds, created_at);

-- The React client should never access these tables directly. All reads/writes
-- go through the Express API using SUPABASE_SECRET_KEY.
alter table public.translate_projects enable row level security;
alter table public.video_annotations enable row level security;
alter table public.timestamped_notes enable row level security;

revoke all on table public.translate_projects from anon, authenticated;
revoke all on table public.video_annotations from anon, authenticated;
revoke all on table public.timestamped_notes from anon, authenticated;

-- Lock down legacy tables from earlier prototypes if they still exist.
alter table if exists public.projects enable row level security;
alter table if exists public.annotations enable row level security;
alter table if exists public.notes enable row level security;

revoke all on table public.projects from anon, authenticated;
revoke all on table public.annotations from anon, authenticated;
revoke all on table public.notes from anon, authenticated;
