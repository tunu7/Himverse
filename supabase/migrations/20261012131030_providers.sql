-- Providers, membership, private details and status lifecycle (ADR-0002).
--
-- Lifecycle: draft -> pending_review -> verified | rejected
--            rejected -> pending_review (resubmit)
--            verified <-> suspended
-- Status changes ONLY through the security definer functions below; the
-- status/verified_at columns are excluded from every update grant.

create type public.provider_status as enum ('draft', 'pending_review', 'verified', 'rejected', 'suspended');
create type public.provider_member_role as enum ('owner');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.providers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    constraint providers_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60),
  display_name text not null
    constraint providers_display_name_length check (char_length(btrim(display_name)) between 2 and 120),
  description text not null default ''
    constraint providers_description_length check (char_length(description) <= 4000),
  district text
    constraint providers_district_length check (district is null or char_length(btrim(district)) between 2 and 80),
  status public.provider_status not null default 'draft',
  verified_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index providers_status_idx on public.providers (status);
create index providers_created_by_idx on public.providers (created_by);

create table public.provider_members (
  provider_id uuid not null references public.providers (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  member_role public.provider_member_role not null default 'owner',
  created_at timestamptz not null default now(),
  primary key (provider_id, user_id)
);

create index provider_members_user_id_idx on public.provider_members (user_id);

-- Data that must never be public. Kept out of `providers` because RLS
-- filters rows, not columns.
create table public.provider_private_details (
  provider_id uuid primary key references public.providers (id) on delete cascade,
  legal_name text not null
    constraint provider_private_details_legal_name_length check (char_length(btrim(legal_name)) between 2 and 200),
  contact_email text not null
    constraint provider_private_details_contact_email_format check (
      char_length(contact_email) <= 254 and contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    ),
  contact_phone text
    constraint provider_private_details_contact_phone_format check (
      contact_phone is null or contact_phone ~ '^\+?[0-9][0-9 ()-]{6,19}$'
    ),
  updated_at timestamptz not null default now()
);

create table public.provider_status_events (
  id bigint generated always as identity primary key,
  provider_id uuid not null references public.providers (id) on delete cascade,
  from_status public.provider_status,
  to_status public.provider_status not null,
  actor_id uuid references auth.users (id) on delete set null,
  note text
    constraint provider_status_events_note_length check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now()
);

create index provider_status_events_provider_id_idx on public.provider_status_events (provider_id);
create index provider_status_events_actor_id_idx on public.provider_status_events (actor_id);

create trigger providers_set_updated_at
  before update on public.providers
  for each row execute function private.set_updated_at();

create trigger provider_private_details_set_updated_at
  before update on public.provider_private_details
  for each row execute function private.set_updated_at();

alter table public.providers enable row level security;
alter table public.provider_members enable row level security;
alter table public.provider_private_details enable row level security;
alter table public.provider_status_events enable row level security;

-- ---------------------------------------------------------------------------
-- Privileges (deny by default, grant back the minimum)
-- ---------------------------------------------------------------------------

revoke all on public.providers from anon, authenticated;
grant select on public.providers to anon, authenticated;
grant update (display_name, description, district) on public.providers to authenticated;

revoke all on public.provider_members from anon, authenticated;
grant select on public.provider_members to authenticated;

revoke all on public.provider_private_details from anon, authenticated;
grant select on public.provider_private_details to authenticated;
grant update (legal_name, contact_email, contact_phone) on public.provider_private_details to authenticated;

revoke all on public.provider_status_events from anon, authenticated;
grant select on public.provider_status_events to authenticated;

-- ---------------------------------------------------------------------------
-- Policy helpers
-- ---------------------------------------------------------------------------

create function private.is_provider_member(p_provider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.provider_members pm
    where pm.provider_id = p_provider_id
      and pm.user_id = (select auth.uid())
  );
$$;

create function private.is_provider_verified(p_provider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.providers p
    where p.id = p_provider_id
      and p.status = 'verified'
  );
$$;

revoke all on function private.is_provider_member(uuid) from public;
revoke all on function private.is_provider_verified(uuid) from public;
grant execute on function private.is_provider_member(uuid) to anon, authenticated;
grant execute on function private.is_provider_verified(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

create policy "public reads verified providers"
  on public.providers for select to anon, authenticated
  using (status = 'verified');

create policy "members read own providers"
  on public.providers for select to authenticated
  using (private.is_provider_member(id));

create policy "admins read all providers"
  on public.providers for select to authenticated
  using ((select private.has_role('admin')));

create policy "members update own provider profile"
  on public.providers for update to authenticated
  using (private.is_provider_member(id))
  with check (private.is_provider_member(id));

create policy "users read own memberships"
  on public.provider_members for select to authenticated
  using (user_id = (select auth.uid()));

create policy "admins read all memberships"
  on public.provider_members for select to authenticated
  using ((select private.has_role('admin')));

create policy "members read own private details"
  on public.provider_private_details for select to authenticated
  using (private.is_provider_member(provider_id));

create policy "admins read all private details"
  on public.provider_private_details for select to authenticated
  using ((select private.has_role('admin')));

create policy "members update own private details"
  on public.provider_private_details for update to authenticated
  using (private.is_provider_member(provider_id))
  with check (private.is_provider_member(provider_id));

create policy "members read own status events"
  on public.provider_status_events for select to authenticated
  using (private.is_provider_member(provider_id));

create policy "admins read all status events"
  on public.provider_status_events for select to authenticated
  using ((select private.has_role('admin')));

-- ---------------------------------------------------------------------------
-- Lifecycle functions (exposed as RPC to authenticated users only)
--
-- Error codes (mapped to AppError in src/server):
--   42501 insufficient_privilege  -> UNAUTHENTICATED / FORBIDDEN
--   P0002 no_data_found           -> NOT_FOUND
--   55000 object_not_in_prerequisite_state (invalid transition) -> CONFLICT
--   22023 invalid_parameter_value -> VALIDATION_FAILED
--   23505 / 23514 (unique / check) raised by constraints
-- ---------------------------------------------------------------------------

create function public.create_provider_application(
  p_slug text,
  p_display_name text,
  p_description text,
  p_district text,
  p_legal_name text,
  p_contact_email text,
  p_contact_phone text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_provider_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  insert into public.providers (slug, display_name, description, district, created_by)
  values (
    lower(btrim(p_slug)),
    btrim(p_display_name),
    coalesce(p_description, ''),
    nullif(btrim(p_district), ''),
    v_user_id
  )
  returning id into v_provider_id;

  insert into public.provider_members (provider_id, user_id, member_role)
  values (v_provider_id, v_user_id, 'owner');

  insert into public.provider_private_details (provider_id, legal_name, contact_email, contact_phone)
  values (v_provider_id, btrim(p_legal_name), lower(btrim(p_contact_email)), nullif(btrim(p_contact_phone), ''));

  insert into public.provider_status_events (provider_id, from_status, to_status, actor_id)
  values (v_provider_id, null, 'draft', v_user_id);

  return v_provider_id;
end;
$$;

create function public.submit_provider_application(p_provider_id uuid)
returns public.provider_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_status public.provider_status;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.provider_members pm
    where pm.provider_id = p_provider_id
      and pm.user_id = v_user_id
      and pm.member_role = 'owner'
  ) then
    -- Same error whether the provider is missing or not theirs: no existence leak.
    raise exception 'provider not found' using errcode = 'P0002';
  end if;

  select p.status into v_status
  from public.providers p
  where p.id = p_provider_id
  for update;

  if v_status not in ('draft', 'rejected') then
    raise exception 'cannot submit a provider in status %', v_status using errcode = '55000';
  end if;

  update public.providers set status = 'pending_review' where id = p_provider_id;

  insert into public.provider_status_events (provider_id, from_status, to_status, actor_id)
  values (p_provider_id, v_status, 'pending_review', v_user_id);

  return 'pending_review';
end;
$$;

create function public.review_provider(
  p_provider_id uuid,
  p_decision public.provider_status,
  p_note text default null
)
returns public.provider_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_status public.provider_status;
  v_note text := nullif(btrim(p_note), '');
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not private.has_role('admin') then
    raise exception 'admin role required' using errcode = '42501';
  end if;

  -- Admins may not review a provider they belong to (conflict of interest).
  if private.is_provider_member(p_provider_id) then
    raise exception 'admins cannot review their own provider' using errcode = '42501';
  end if;

  select p.status into v_status
  from public.providers p
  where p.id = p_provider_id
  for update;

  if not found then
    raise exception 'provider not found' using errcode = 'P0002';
  end if;

  if not (
    (v_status = 'pending_review' and p_decision in ('verified', 'rejected'))
    or (v_status = 'verified' and p_decision = 'suspended')
    or (v_status = 'suspended' and p_decision = 'verified')
  ) then
    raise exception 'cannot change provider from % to %', v_status, p_decision using errcode = '55000';
  end if;

  if p_decision in ('rejected', 'suspended') and v_note is null then
    raise exception 'a note is required when rejecting or suspending' using errcode = '22023';
  end if;

  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'note is too long' using errcode = '22023';
  end if;

  update public.providers
  set status = p_decision,
      verified_at = case when p_decision = 'verified' then now() else verified_at end
  where id = p_provider_id;

  insert into public.provider_status_events (provider_id, from_status, to_status, actor_id, note)
  values (p_provider_id, v_status, p_decision, v_user_id, v_note);

  return p_decision;
end;
$$;

revoke all on function public.create_provider_application(text, text, text, text, text, text, text) from public, anon;
revoke all on function public.submit_provider_application(uuid) from public, anon;
revoke all on function public.review_provider(uuid, public.provider_status, text) from public, anon;
grant execute on function public.create_provider_application(text, text, text, text, text, text, text) to authenticated;
grant execute on function public.submit_provider_application(uuid) to authenticated;
grant execute on function public.review_provider(uuid, public.provider_status, text) to authenticated;
