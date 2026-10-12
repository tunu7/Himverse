-- Identity and roles (ADR-0002).
--
-- * profiles: one row per auth user, created by trigger. Users read their own
--   profile and may update display_name only.
-- * user_roles: elevated roles (admin). No application write path exists:
--   anon/authenticated have no insert/update/delete privilege. Admins are
--   granted by the database owner via the runbook in
--   docs/security/AUTHORIZATION_AND_RLS.md.
--
-- Supabase grants ALL on new public tables to anon/authenticated by default,
-- so every table below revokes those and grants back only what is needed.

-- ---------------------------------------------------------------------------
-- Private schema for policy helpers (not exposed through the Data API)
-- ---------------------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null
    constraint profiles_display_name_length check (char_length(btrim(display_name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

-- Creates the profile for every new auth user. Signup metadata is used only
-- to prefill display_name; it never influences authorization.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(btrim(left(new.raw_user_meta_data ->> 'display_name', 80)), ''),
      nullif(btrim(left(split_part(coalesce(new.email, ''), '@', 1), 80)), ''),
      'Traveler'
    )
  );
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- user_roles
-- ---------------------------------------------------------------------------

create type public.app_role as enum ('admin');

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create index user_roles_granted_by_idx on public.user_roles (granted_by);

alter table public.user_roles enable row level security;

revoke all on public.user_roles from anon, authenticated;
grant select on public.user_roles to authenticated;
-- Deliberately no insert/update/delete grants and no write policies.

-- True when the calling user holds the role. SECURITY DEFINER so policies on
-- user_roles itself can use it without recursing through RLS.
create function private.has_role(p_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role = p_role
  );
$$;

revoke all on function private.has_role(public.app_role) from public;
grant execute on function private.has_role(public.app_role) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

create policy "users read own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "admins read all profiles"
  on public.profiles for select to authenticated
  using ((select private.has_role('admin')));

create policy "users update own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "users read own roles"
  on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()));

create policy "admins read all roles"
  on public.user_roles for select to authenticated
  using ((select private.has_role('admin')));
