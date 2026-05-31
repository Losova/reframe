create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_email text not null,
  brand_name text,
  brand_accent text not null default '#d6a15f',
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  subscription_status text not null default 'trialing',
  plan_name text not null default 'studio_monthly',
  monthly_price_usd integer not null default 18,
  trial_ends_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists workspaces_owner_email_idx
on public.workspaces (lower(owner_email));

create table if not exists public.workspace_clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  name text not null,
  email text,
  company text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists workspace_clients_workspace_idx
on public.workspace_clients (workspace_id, created_at desc);

alter table public.translate_projects
add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;

alter table public.translate_projects
add column if not exists client_name text;

alter table public.translate_projects
add column if not exists client_email text;

alter table public.translate_projects
add column if not exists brand_name text;

alter table public.translate_projects
add column if not exists brand_accent text not null default '#d6a15f';

alter table public.translate_projects
add column if not exists status text not null default 'in_review'
check (status in ('draft', 'in_review', 'changes_requested', 'approved', 'final_delivered'));

alter table public.translate_projects
add column if not exists version_label text not null default 'Version 1';

alter table public.translate_projects
add column if not exists due_at timestamptz;

alter table public.translate_projects
add column if not exists download_enabled boolean not null default false;

alter table public.translate_projects
add column if not exists link_expires_at timestamptz;

create index if not exists translate_projects_workspace_status_idx
on public.translate_projects (workspace_id, status, created_at desc);

create table if not exists public.project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.translate_projects(id) on delete cascade,
  share_id text not null,
  version_label text not null,
  playback_path text not null,
  original_filename text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists project_versions_project_idx
on public.project_versions (project_id, created_at desc);

create table if not exists public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  share_id text not null,
  note_id uuid references public.timestamped_notes(id) on delete set null,
  title text not null,
  status text not null default 'open'
    check (status in ('open', 'resolved', 'wont_fix')),
  created_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz
);

create index if not exists project_tasks_share_status_idx
on public.project_tasks (share_id, status, created_at desc);

create table if not exists public.project_activity (
  id uuid primary key default gen_random_uuid(),
  share_id text not null,
  actor_label text not null,
  event_type text not null,
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists project_activity_share_created_idx
on public.project_activity (share_id, created_at desc);

create table if not exists public.project_invites (
  id uuid primary key default gen_random_uuid(),
  share_id text not null,
  reviewer_email text not null,
  role text not null default 'reviewer',
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists project_invites_share_idx
on public.project_invites (share_id, created_at desc);

alter table public.workspaces enable row level security;
alter table public.workspace_clients enable row level security;
alter table public.project_versions enable row level security;
alter table public.project_tasks enable row level security;
alter table public.project_activity enable row level security;
alter table public.project_invites enable row level security;

revoke all on table public.workspaces from anon, authenticated;
revoke all on table public.workspace_clients from anon, authenticated;
revoke all on table public.project_versions from anon, authenticated;
revoke all on table public.project_tasks from anon, authenticated;
revoke all on table public.project_activity from anon, authenticated;
revoke all on table public.project_invites from anon, authenticated;
