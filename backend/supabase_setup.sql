-- Run once in Supabase Dashboard -> SQL Editor.
-- Metadata table for saved projects. The backend uses the service_role key
-- (bypasses RLS), so RLS is enabled with no policies -- deny-by-default for
-- any other client, e.g. if the anon key is ever used directly.

create table if not exists public.projects (
  id text primary key,
  name text not null default 'Untitled Project',
  size_bytes bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.projects enable row level security;
