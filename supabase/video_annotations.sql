create extension if not exists pgcrypto;

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
