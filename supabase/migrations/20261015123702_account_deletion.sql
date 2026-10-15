-- Self-serve account deletion (Phase 4, launch readiness; ADR-0009).
--
-- A traveller's or partner's own account can be deleted from account settings.
-- Partners keep a record of past bookings, anonymised: bookings no longer
-- cascade with the user, and the traveller's personal details are removed by a
-- trigger, so every deletion path (the app, the dashboard, the admin API) scrubs
-- them. Admin accounts are removed only by the owner (ADR-0002 bootstrap runbook).

-- Bookings outlive the traveller's account.
alter table public.bookings
  alter column traveler_id drop not null,
  drop constraint bookings_traveler_id_fkey,
  add constraint bookings_traveler_id_fkey
    foreign key (traveler_id) references auth.users (id) on delete set null;

-- An anonymised booking has no phone number.
alter table public.bookings
  drop constraint bookings_contact_phone_format,
  add constraint bookings_contact_phone_format
    check (contact_phone = '' and traveler_id is null or contact_phone ~ '^\+?[0-9][0-9 ()-]{6,19}$');

-- When a booking loses its traveller (account deleted by any path, including the
-- FK's `set null`), remove what the traveller wrote or gave: name, phone, notes,
-- pickup details, and their own cancellation reasons and history notes (replaced
-- by a fixed sentence, so partners still see why a booking was cancelled).
create or replace function private.anonymise_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.traveler_name := 'Deleted traveller';
  new.contact_phone := '';
  new.traveler_note := '';
  new.pickup_note := '';
  if new.cancelled_by = 'traveler' then
    new.cancellation_reason := 'The traveller deleted their account.';
  end if;
  update public.booking_events e set note = 'The traveller deleted their account.'
  where e.booking_id = new.id and e.actor_role = 'traveler' and e.note is not null;
  return new;
end;
$$;
revoke all on function private.anonymise_booking() from public, anon, authenticated;

create trigger bookings_anonymise_on_traveller_removed
  before update of traveler_id on public.bookings
  for each row
  when (old.traveler_id is not null and new.traveler_id is null)
  execute function private.anonymise_booking();

-- A primary or second-factor sign-in within the last 15 minutes, read from the
-- signed JWT's `amr`. Re-checking a password elsewhere doesn't count: the
-- session itself must be fresh, so a stolen token can't delete an account.
create or replace function private.signed_in_recently(p_max_age_seconds integer)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from jsonb_array_elements(coalesce((select auth.jwt()) -> 'amr', '[]'::jsonb)) as a(entry)
    where jsonb_typeof(a.entry) = 'object'
      and a.entry ->> 'method' in ('password', 'oauth', 'totp', 'otp', 'recovery')
      and (a.entry ->> 'timestamp') ~ '^[0-9]+$'
      and (a.entry ->> 'timestamp')::bigint >= extract(epoch from now())::bigint - p_max_age_seconds
  );
$$;
revoke all on function private.signed_in_recently(integer) from public, anon, authenticated;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_type public.account_type;
  v_booking_id uuid;
  v_sole_providers uuid[];
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  -- Serialise with anything that references this user: new bookings (FK key
  -- share) wait and then fail, so none escape cancellation.
  perform 1 from auth.users u where u.id = v_user_id for update;

  select p.account_type into v_type from public.profiles p where p.id = v_user_id for update;
  if v_type = 'admin' or exists (select 1 from public.user_roles r where r.user_id = v_user_id) then
    raise exception 'admin accounts are removed by the platform owner'
      using errcode = '42501', hint = 'admin';
  end if;

  -- Accounts with an authenticator must have used it in this session.
  if exists (select 1 from auth.mfa_factors f where f.user_id = v_user_id and f.status = 'verified')
     and not private.has_second_factor() then
    raise exception 'verify your two-step login first' using errcode = '42501', hint = 'second_step';
  end if;

  if not private.signed_in_recently(900) then
    raise exception 'sign in again to delete your account' using errcode = '42501', hint = 'reauthenticate';
  end if;

  -- Businesses the caller runs, locked so two co-members can't both leave at once.
  perform 1 from public.providers pr
  where pr.id in (select m.provider_id from public.provider_members m where m.user_id = v_user_id)
  order by pr.id
  for update;
  select coalesce(array_agg(m.provider_id), '{}') into v_sole_providers
  from public.provider_members m
  where m.user_id = v_user_id
    and not exists (
      select 1 from public.provider_members o
      where o.provider_id = m.provider_id and o.user_id <> v_user_id
    );

  -- The last member of a business can't leave open bookings unanswered.
  if exists (
    select 1 from public.bookings b
    where b.provider_id = any (v_sole_providers)
      and (b.status = 'requested'
        or (b.status = 'confirmed' and coalesce(b.ends_on, b.slot_starts_on) >= private.today_ist()))
  ) then
    raise exception 'answer or cancel your business''s open bookings first'
      using errcode = '55000', hint = 'open_business_bookings';
  end if;
  -- ...and a business left without members stops taking requests nobody would see.
  update public.experiences e set accepts_bookings = false
  where e.provider_id = any (v_sole_providers) and e.accepts_bookings;

  -- Cancel the traveller's open and upcoming bookings through the normal path
  -- (releases seats, writes history, tells the partner why).
  for v_booking_id in
    select b.id from public.bookings b
    where b.traveler_id = v_user_id
      and (b.status = 'requested'
        or (b.status = 'confirmed' and coalesce(b.ends_on, b.slot_starts_on) >= private.today_ist()))
    order by b.created_at
  loop
    begin
      perform public.cancel_booking(v_booking_id, 'The traveller deleted their account.');
    exception when sqlstate '55000' then
      raise exception 'a confirmed booking starts within 24 hours or is under way; delete your account after it ends'
        using errcode = '55000', hint = 'booking_under_way';
    end;
  end loop;

  -- Cascades to the profile, memberships, itineraries and attempt counters;
  -- bookings are kept and anonymised by the trigger above.
  delete from auth.users where id = v_user_id;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
