-- Run once in Supabase Dashboard -> SQL Editor, in the SAME project as
-- ../../backend/supabase_setup.sql and supabase_migration_s3_storage.sql.
--
-- Adds real user persistence for the GitHub OAuth flow in app/api/auth.py
-- (today the JWT's claims ARE the user record -- see
-- app/services/session.py's doc comment) plus a one-time "create your IDE
-- identity" onboarding step. See app/api/user.py for the endpoints that
-- read/write this table.

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  oauth_provider text not null,
  oauth_id text not null,
  username text not null unique,
  display_name text not null,
  email text not null unique,
  avatar_url text,
  bio text,
  country text,
  timezone text,
  preferred_hdl text not null default 'verilog',
  theme text not null default 'system',
  default_visibility text not null default 'private',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (oauth_provider, oauth_id),
  -- Defense in depth: the actual user-facing validation/error copy lives
  -- in app/utils/username.py -- this is a backstop, not the primary check.
  constraint users_username_format check (username ~ '^[a-z][a-z0-9_-]{3,29}$'),
  constraint users_username_not_reserved check (
    username not in (
      'admin', 'support', 'root', 'system', 'api', 'help', 'login', 'logout',
      'dashboard', 'www', 'github', 'google', 'meta', 'null', 'undefined', 'me'
    )
  ),
  constraint users_preferred_hdl_valid check (preferred_hdl in ('verilog', 'systemverilog', 'vhdl', 'mixed')),
  constraint users_theme_valid check (theme in ('light', 'dark', 'system')),
  constraint users_default_visibility_valid check (default_visibility in ('private', 'public'))
);

create index if not exists users_username_idx on public.users (username);

-- Additive only -- existing ownerless projects (saved before this feature
-- existed) keep working exactly as they do today. Nothing enforces this
-- yet; it just records who a project belongs to. See ../../backend/app/api/project.py.
alter table public.projects
  add column if not exists owner_id uuid references public.users(id);

-- Deny-by-default RLS, same pattern as the other migrations: both backends
-- use the service_role key (bypasses RLS) for all access to this table.
alter table public.users enable row level security;
