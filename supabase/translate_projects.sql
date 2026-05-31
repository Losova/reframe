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

alter table public.translate_projects add column if not exists workspace_id uuid;
alter table public.translate_projects add column if not exists client_name text;
alter table public.translate_projects add column if not exists client_email text;
alter table public.translate_projects add column if not exists brand_name text;
alter table public.translate_projects add column if not exists brand_accent text not null default '#d6a15f';
alter table public.translate_projects add column if not exists status text not null default 'in_review';
alter table public.translate_projects add column if not exists version_label text not null default 'Version 1';
alter table public.translate_projects add column if not exists due_at timestamptz;
alter table public.translate_projects add column if not exists download_enabled boolean not null default false;
alter table public.translate_projects add column if not exists link_expires_at timestamptz;

create index if not exists translate_projects_created_at_idx
on public.translate_projects (created_at desc);

create index if not exists translate_projects_workspace_status_idx
on public.translate_projects (workspace_id, status, created_at desc);

-- This app reads/writes project records only through the Express backend using
-- the Supabase secret key. Keep direct browser/PostgREST access closed.
alter table public.translate_projects enable row level security;
revoke all on table public.translate_projects from anon, authenticated;
