-- One account type per account: traveller, partner or admin (ADR-0007,
-- supersedes ADR-0002's "one person can be traveller and provider").
--
-- profiles.account_type is the single source of what an account is:
--   traveller  plans trips and requests bookings
--   partner    applies, lists experiences, manages dates and booking requests
--   admin      reviews and moderates; never books or applies
-- It is never writable through the API. Travellers and partners choose at
-- sign-up (sign-up metadata, or choose_account_type() once after Google
-- sign-in, while it is still null). Admin is set only by granting the admin
-- role (owner-run SQL, see the bootstrap runbook).
--
-- The database enforces the separation, not only the UI:
--   * only traveller accounts can request bookings or generate itineraries;
--   * only partner accounts can become provider members, and provider
--     authority (private.is_provider_member) requires a partner account;
--   * an account with no type yet takes the type of its first such action
--     (a fallback: the app sends untyped accounts to choose first).

create type public.account_type as enum ('traveller', 'partner', 'admin');

-- Nullable: an account created through Google has not chosen yet.
alter table public.profiles add column account_type public.account_type;

-- Existing accounts: admins stay admins, current partner members become
-- partners, accounts that have travelled (bookings or trip plans) become
-- travellers. Accounts with no activity stay untyped and choose on /welcome,
-- so nobody is locked into a type they never picked. An admin who is also a
-- provider member keeps the (now inert) membership; the conflict-of-interest
-- checks below use raw membership, so it can't be abused.
update public.profiles p
set account_type = case
  when exists (select 1 from public.user_roles r where r.user_id = p.id and r.role = 'admin') then 'admin'
  when exists (select 1 from public.provider_members m where m.user_id = p.id) then 'partner'
  when exists (select 1 from public.bookings b where b.traveler_id = p.id)
    or exists (select 1 from public.itineraries i where i.owner_id = p.id) then 'traveller'
end::public.account_type;

-- Readable by the account itself and admins through the existing table-level
-- select grant and policies; not added to any write grant.

-- ---------------------------------------------------------------------------
-- New accounts: traveller or partner from sign-up metadata; never admin.
-- ---------------------------------------------------------------------------

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text := new.raw_user_meta_data ->> 'account_type';
begin
  insert into public.profiles (id, display_name, account_type)
  values (
    new.id,
    coalesce(
      nullif(btrim(left(new.raw_user_meta_data ->> 'display_name', 80)), ''),
      nullif(btrim(left(new.raw_user_meta_data ->> 'full_name', 80)), ''),
      nullif(btrim(left(new.raw_user_meta_data ->> 'name', 80)), ''),
      nullif(btrim(left(split_part(coalesce(new.email, ''), '@', 1), 80)), ''),
      'Traveller'
    ),
    case when v_type in ('traveller', 'partner') then v_type::public.account_type end
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function private.current_account_type()
returns public.account_type
language sql
stable
security definer
set search_path = ''
as $$
  select p.account_type from public.profiles p where p.id = (select auth.uid());
$$;

-- Sets the account's type if it has none yet and returns the type it has.
create function private.claim_account_type(p_user_id uuid, p_type public.account_type)
returns public.account_type
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.account_type;
begin
  if p_type = 'admin' then
    raise exception 'admin accounts cannot be claimed' using errcode = '42501';
  end if;
  update public.profiles set account_type = p_type
  where id = p_user_id and account_type is null;
  select p.account_type into v_type from public.profiles p where p.id = p_user_id;
  return v_type;
end;
$$;

-- For policies and tests; callable only for the caller's own account.
revoke all on function private.current_account_type() from public, anon;
grant execute on function private.current_account_type() to authenticated;
revoke all on function private.claim_account_type(uuid, public.account_type) from public, anon, authenticated;

-- Provider authority requires a partner account (an admin who is still a
-- member, or a converted account, holds no provider power).
create or replace function private.is_provider_member(p_provider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.provider_members pm
    join public.profiles p on p.id = pm.user_id
    where pm.provider_id = p_provider_id
      and pm.user_id = (select auth.uid())
      and p.account_type = 'partner'
  );
$$;

-- ---------------------------------------------------------------------------
-- Choosing a type (once, after Google sign-in)
-- ---------------------------------------------------------------------------

create function public.choose_account_type(p_type public.account_type)
returns public.account_type
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_type public.account_type;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_type is null or p_type = 'admin' then
    raise exception 'choose traveller or partner' using errcode = '22023';
  end if;
  v_type := private.claim_account_type(v_user_id, p_type);
  if v_type is null then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
  if v_type is distinct from p_type then
    raise exception 'this account is already set up as %', v_type using errcode = '55000';
  end if;
  return v_type;
end;
$$;

revoke all on function public.choose_account_type(public.account_type) from public, anon;
grant execute on function public.choose_account_type(public.account_type) to authenticated;

-- ---------------------------------------------------------------------------
-- Enforcement
-- ---------------------------------------------------------------------------

-- Admin role => admin account (owner-run grants only; see the runbook). An
-- account that still belongs to a provider can't become an admin: the owner
-- removes the membership first, so admin and business never mix.
create function private.sync_admin_account_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'admin' then
    if exists (select 1 from public.provider_members m where m.user_id = new.user_id) then
      raise exception 'this account belongs to a provider; remove its memberships before granting admin'
        using errcode = '42501';
    end if;
    update public.profiles set account_type = 'admin' where id = new.user_id;
  end if;
  return new;
end;
$$;

-- Revoking admin leaves an untyped account that chooses again on /welcome.
create function private.clear_admin_account_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'admin' then
    update public.profiles set account_type = null
    where id = old.user_id and account_type = 'admin';
  end if;
  return old;
end;
$$;

revoke all on function private.sync_admin_account_type() from public, anon, authenticated;
revoke all on function private.clear_admin_account_type() from public, anon, authenticated;

create trigger user_roles_sync_account_type
  after insert on public.user_roles
  for each row execute function private.sync_admin_account_type();

create trigger user_roles_clear_account_type
  after delete on public.user_roles
  for each row execute function private.clear_admin_account_type();

-- ---------------------------------------------------------------------------
-- Conflict of interest uses raw membership, whatever the account type
-- ---------------------------------------------------------------------------

-- is_provider_member now means "holds provider authority" (partner accounts
-- only). Conflict-of-interest checks must still see an admin's old,
-- inert membership, so they use this instead.
create function private.belongs_to_provider(p_provider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.provider_members pm
    where pm.provider_id = p_provider_id and pm.user_id = (select auth.uid())
  );
$$;

revoke all on function private.belongs_to_provider(uuid) from public, anon, authenticated;

create or replace function public.review_provider(
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
  if private.belongs_to_provider(p_provider_id) then
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

create or replace function private.enforce_experience_moderation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- An admin who belongs to the provider is treated as a member (conflict of interest).
  v_moderator boolean := private.has_role('admin') and not private.belongs_to_provider(new.provider_id);
begin
  if v_moderator then
    if new.status is distinct from old.status then
      new.moderation_locked := new.status <> 'published';
    end if;
  elsif old.moderation_locked and new.status = 'published' then
    raise exception 'experience is locked by moderation' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Submitting an application is provider authority: partner accounts only.
create or replace function public.submit_provider_application(p_provider_id uuid)
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
  ) or private.current_account_type() is distinct from 'partner' then
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

-- Only partner accounts can belong to a provider (covers create_provider_application
-- and any owner-run SQL).
create function private.enforce_partner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.claim_account_type(new.user_id, 'partner') is distinct from 'partner' then
    raise exception 'only partner accounts can run a tourism business on Himverse' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_partner_membership() from public, anon, authenticated;

create trigger provider_members_partner_only
  before insert on public.provider_members
  for each row execute function private.enforce_partner_membership();

-- Only traveller accounts plan AI trips (every generation is reserved here first).
create function private.enforce_traveller_generation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.claim_account_type(new.user_id, 'traveller') is distinct from 'traveller' then
    raise exception 'only traveller accounts can plan trips' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_traveller_generation() from public, anon, authenticated;

create trigger itinerary_generations_traveller_only
  before insert on public.itinerary_generations
  for each row execute function private.enforce_traveller_generation();

-- Only traveller accounts request bookings. A row trigger covers every path
-- (request_booking, request_booking_on_date, request_itinerary_bookings).
create function private.enforce_traveller_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.claim_account_type(new.traveler_id, 'traveller') is distinct from 'traveller' then
    raise exception 'only traveller accounts can request bookings' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_traveller_booking() from public, anon, authenticated;

-- Named to sort before bookings_enforce_request_limits (BEFORE triggers fire alphabetically).
create trigger bookings_a_traveller_only
  before insert on public.bookings
  for each row execute function private.enforce_traveller_booking();
