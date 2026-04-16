create extension if not exists pgcrypto;

create table if not exists public.timestamped_notes (
  id uuid primary key default gen_random_uuid(),
  share_id text not null,
  session_id text not null,
  timestamp_seconds double precision not null check (timestamp_seconds >= 0),
  note_text text not null,
  ai_translation jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.timestamped_notes
add column if not exists ai_translation jsonb;

create index if not exists timestamped_notes_share_timestamp_idx
on public.timestamped_notes (share_id, timestamp_seconds, created_at);
