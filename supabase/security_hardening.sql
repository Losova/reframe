-- Harden Translate's server-owned tables.
-- The React client should never access these tables directly; all reads/writes
-- go through the Express API using SUPABASE_SECRET_KEY.

alter table if exists public.translate_projects enable row level security;
alter table if exists public.video_annotations enable row level security;
alter table if exists public.timestamped_notes enable row level security;
alter table if exists public.projects enable row level security;
alter table if exists public.annotations enable row level security;
alter table if exists public.notes enable row level security;

revoke all on table public.translate_projects from anon, authenticated;
revoke all on table public.video_annotations from anon, authenticated;
revoke all on table public.timestamped_notes from anon, authenticated;
revoke all on table public.projects from anon, authenticated;
revoke all on table public.annotations from anon, authenticated;
revoke all on table public.notes from anon, authenticated;
