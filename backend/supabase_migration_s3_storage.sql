-- Run once in Supabase Dashboard -> SQL Editor, AFTER supabase_setup.sql.
--
-- Migrates project storage off Supabase Storage (which held one whole-tree
-- JSON blob per project) onto AWS S3 (one object per file) + these metadata
-- tables. Postgres never stores file content from here on -- only
-- references (s3_key) into the bucket. See app/services/s3_service.py,
-- app/services/metadata_service.py, app/services/project_storage_service.py.
--
-- `node_id` on folders/files is the frontend explorer's own id (see
-- frontend/src/services/mockFileSystem.ts genId) -- unique only *within* a
-- project, never globally, hence `unique(project_id, node_id)` rather than
-- using it as a primary key.

alter table public.projects
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  node_id text not null,
  parent_node_id text,  -- null = this project's root folder (exactly one per project)
  name text not null,
  path text not null,   -- materialized relative path, e.g. "rtl/sub"
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (project_id, node_id)
);

create index if not exists folders_project_idx
  on public.folders (project_id) where deleted_at is null;

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  node_id text not null,
  folder_node_id text not null,  -- every file lives under some folder, root included
  name text not null,
  path text not null,
  extension text,
  mime_type text,
  size_bytes bigint not null default 0,
  s3_key text not null,
  checksum text not null,  -- sha256 hex of current content, used to skip no-op re-uploads
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (project_id, node_id)
);

create index if not exists files_project_idx
  on public.files (project_id) where deleted_at is null;
create index if not exists files_folder_idx
  on public.files (project_id, folder_node_id) where deleted_at is null;

-- Append-only version history: one row per S3 object ever written for a
-- file. `files` always points at the latest via s3_key/version/checksum.
create table if not exists public.file_versions (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files(id) on delete cascade,
  version integer not null,
  s3_key text not null,
  size_bytes bigint not null,
  checksum text not null,
  created_at timestamptz not null default now(),
  unique (file_id, version)
);

-- Deny-by-default RLS, same pattern as supabase_setup.sql: the backend uses
-- the service_role key (bypasses RLS) for all access to these tables.
alter table public.folders enable row level security;
alter table public.files enable row level security;
alter table public.file_versions enable row level security;
