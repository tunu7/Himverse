-- Phase 4: booking lifecycle (ADR-0004).
--
-- Lifecycle:
--   requested -> confirmed (provider; re-checks seats + experience still public)
--   requested -> declined  (provider; reason required)
--   requested -> cancelled (traveler; any time)
--   requested -> expired   (system; 48 h without a reply or slot start reached)
--   confirmed -> cancelled (traveler >= 24 h before start; provider with reason)
--   confirmed -> completed (system; after the slot date)
--
-- All status, price and ownership changes go through the security definer
-- functions below; no API role can update those columns. Every change writes a
-- booking_events row. Seats are counted only for confirmed bookings and the
-- check constraint seats_confirmed <= capacity makes overbooking impossible.

create type public.booking_status as enum ('requested', 'confirmed', 'declined', 'cancelled', 'expired', 'completed');
create type public.booking_actor as enum ('traveler', 'provider', 'system');
create type public.availability_slot_status as enum ('open', 'closed');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Publicly visible experience: published, verified provider, published destination.
create function private.is_experience_public(p_experience_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.experiences e
    where e.id = p_experience_id
      and e.status = 'published'
      and private.is_provider_verified(e.provider_id)
      and private.is_destination_published(e.destination_id)
  );
$$;

create function private.is_experience_member(p_experience_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.experiences e
    where e.id = p_experience_id and private.is_provider_member(e.provider_id)
  );
$$;

create function private.today_ist()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Kolkata')::date;
$$;

create function private.slot_starts_at(p_starts_on date, p_start_time time)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select (p_starts_on + coalesce(p_start_time, time '00:00')) at time zone 'Asia/Kolkata';
$$;

-- ---------------------------------------------------------------------------
-- availability_slots
-- ---------------------------------------------------------------------------

create table public.availability_slots (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences (id) on delete cascade,
  starts_on date not null,
  start_time time,
  capacity integer not null constraint availability_slots_capacity_range check (capacity between 1 and 500),
  seats_confirmed integer not null default 0
    constraint availability_slots_seats_non_negative check (seats_confirmed >= 0),
  status public.availability_slot_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint availability_slots_not_overbooked check (seats_confirmed <= capacity),
  constraint availability_slots_unique unique nulls not distinct (experience_id, starts_on, start_time)
);

create index availability_slots_experience_date_idx on public.availability_slots (experience_id, starts_on);

create trigger availability_slots_set_updated_at
  before update on public.availability_slots
  for each row execute function private.set_updated_at();

alter table public.availability_slots enable row level security;

revoke all on public.availability_slots from anon, authenticated;
grant select on public.availability_slots to anon, authenticated;
grant insert (experience_id, starts_on, start_time, capacity) on public.availability_slots to authenticated;
grant update (capacity, status) on public.availability_slots to authenticated;

create policy "public reads open upcoming slots of public experiences"
  on public.availability_slots for select to anon, authenticated
  using (
    status = 'open'
    and starts_on >= private.today_ist()
    and private.is_experience_public(experience_id)
  );

create policy "provider members read own slots"
  on public.availability_slots for select to authenticated
  using (private.is_experience_member(experience_id));

create policy "provider members add upcoming slots"
  on public.availability_slots for insert to authenticated
  with check (private.is_experience_member(experience_id) and starts_on >= private.today_ist());

create policy "provider members update own slots"
  on public.availability_slots for update to authenticated
  using (private.is_experience_member(experience_id))
  with check (private.is_experience_member(experience_id));

-- ---------------------------------------------------------------------------
-- bookings and booking_events
-- ---------------------------------------------------------------------------

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique constraint bookings_reference_format check (reference ~ '^HV-[A-Z0-9]{6}$'),
  traveler_id uuid not null references auth.users (id) on delete cascade,
  provider_id uuid not null references public.providers (id) on delete restrict,
  experience_id uuid not null references public.experiences (id) on delete restrict,
  slot_id uuid not null references public.availability_slots (id) on delete restrict,
  adults integer not null constraint bookings_adults_range check (adults between 1 and 20),
  children integer not null default 0 constraint bookings_children_range check (children between 0 and 19),
  party_size integer generated always as (adults + children) stored
    constraint bookings_party_size_range check (party_size between 1 and 20),
  -- Snapshots so bookings stay readable after slots close or experiences are hidden.
  experience_title text not null constraint bookings_experience_title_length check (char_length(experience_title) between 1 and 140),
  slot_starts_on date not null,
  slot_start_time time,
  -- Snapshot of the traveler's display name for the provider (providers can't read profiles).
  traveler_name text not null constraint bookings_traveler_name_length check (char_length(traveler_name) between 1 and 80),
  contact_phone text not null constraint bookings_contact_phone_format check (contact_phone ~ '^\+?[0-9][0-9 ()-]{6,19}$'),
  traveler_note text not null default '' constraint bookings_traveler_note_length check (char_length(traveler_note) <= 500),
  status public.booking_status not null default 'requested',
  -- Server snapshot at request time (DB per-person price x party); null when unpriced.
  estimated_total_minor bigint constraint bookings_estimate_non_negative check (estimated_total_minor >= 0),
  -- Set by the provider when confirming (provider-confirmed price; no payment taken).
  confirmed_total_minor bigint constraint bookings_confirmed_total_non_negative check (confirmed_total_minor >= 0),
  currency text not null default 'INR' constraint bookings_currency_inr check (currency = 'INR'),
  provider_note text constraint bookings_provider_note_length check (char_length(provider_note) <= 500),
  cancellation_reason text constraint bookings_cancellation_reason_length check (char_length(cancellation_reason) <= 500),
  cancelled_by public.booking_actor,
  request_expires_at timestamptz not null,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_idempotency_unique unique (traveler_id, idempotency_key),
  constraint bookings_confirmed_has_total check (status <> 'confirmed' or confirmed_total_minor is not null)
);

-- At most one active (requested or confirmed) booking per traveler per slot.
create unique index bookings_one_active_per_slot_idx
  on public.bookings (traveler_id, slot_id) where status in ('requested', 'confirmed');
create index bookings_traveler_created_idx on public.bookings (traveler_id, created_at desc);
create index bookings_provider_status_idx on public.bookings (provider_id, status);
create index bookings_slot_id_idx on public.bookings (slot_id);
create index bookings_experience_id_idx on public.bookings (experience_id);
create index bookings_requested_expiry_idx on public.bookings (request_expires_at) where status = 'requested';

create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function private.set_updated_at();

create table public.booking_events (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  from_status public.booking_status,
  to_status public.booking_status not null,
  actor_role public.booking_actor not null,
  actor_id uuid references auth.users (id) on delete set null,
  note text constraint booking_events_note_length check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);

create index booking_events_booking_id_idx on public.booking_events (booking_id, id);
create index booking_events_actor_id_idx on public.booking_events (actor_id);

alter table public.bookings enable row level security;
alter table public.booking_events enable row level security;

revoke all on public.bookings from anon, authenticated;
grant select on public.bookings to authenticated;
revoke all on public.booking_events from anon, authenticated;
grant select on public.booking_events to authenticated;
revoke all on sequence public.booking_events_id_seq from anon, authenticated;

create function private.can_view_booking(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.bookings b
    where b.id = p_booking_id
      and (b.traveler_id = (select auth.uid()) or private.is_provider_member(b.provider_id) or private.has_role('admin'))
  );
$$;

create policy "travelers read own bookings"
  on public.bookings for select to authenticated
  using (traveler_id = (select auth.uid()));

create policy "provider members read their provider's bookings"
  on public.bookings for select to authenticated
  using (private.is_provider_member(provider_id));

create policy "admins read all bookings"
  on public.bookings for select to authenticated
  using ((select private.has_role('admin')));

create policy "booking parties read booking events"
  on public.booking_events for select to authenticated
  using (private.can_view_booking(booking_id));

-- ---------------------------------------------------------------------------
-- Functions
--
-- Error codes (mapped in src/server/bookings/repository.ts):
--   42501 not allowed      P0002 booking/slot not found (or not visible)
--   55000 not possible in the current state (closed/full slot, expired request,
--         unbookable experience, too late to cancel)
--   22023 invalid argument (party, phone, missing reason, key reused differently)
--   23505 traveler already has an active booking for this slot
-- ---------------------------------------------------------------------------

create function private.new_booking_reference()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_reference text;
begin
  loop
    v_reference := 'HV-';
    for i in 1..6 loop
      v_reference := v_reference || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::integer, 1);
    end loop;
    exit when not exists (select 1 from public.bookings b where b.reference = v_reference);
  end loop;
  return v_reference;
end;
$$;

create function public.request_booking(
  p_slot_id uuid,
  p_adults integer,
  p_children integer,
  p_contact_phone text,
  p_note text,
  p_idempotency_key uuid
)
returns table (booking_id uuid, booking_reference text, booking_status public.booking_status, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_existing record;
  v_slot record;
  v_experience record;
  v_party integer;
  v_phone text := btrim(coalesce(p_contact_phone, ''));
  v_note text := btrim(coalesce(p_note, ''));
  v_starts_at timestamptz;
  v_id uuid;
  v_reference text;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency key required' using errcode = '22023';
  end if;

  -- Idempotent replay: the same key returns the original booking.
  select b.id, b.reference, b.status, b.slot_id, b.adults, b.children, b.contact_phone
  into v_existing
  from public.bookings b
  where b.traveler_id = v_user_id and b.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.slot_id <> p_slot_id or v_existing.adults <> p_adults
       or v_existing.children <> coalesce(p_children, 0) or v_existing.contact_phone <> v_phone then
      raise exception 'idempotency key was already used for a different request' using errcode = '22023';
    end if;
    return query select v_existing.id, v_existing.reference, v_existing.status, true;
    return;
  end if;

  if p_adults is null or p_adults < 1 or p_adults > 20 or coalesce(p_children, 0) < 0
     or p_adults + coalesce(p_children, 0) > 20 then
    raise exception 'party size must be between 1 and 20' using errcode = '22023';
  end if;
  v_party := p_adults + coalesce(p_children, 0);
  if v_phone !~ '^\+?[0-9][0-9 ()-]{6,19}$' then
    raise exception 'a valid contact phone is required' using errcode = '22023';
  end if;
  if char_length(v_note) > 500 then
    raise exception 'note is too long' using errcode = '22023';
  end if;

  select s.id, s.experience_id, s.starts_on, s.start_time, s.capacity, s.seats_confirmed, s.status
  into v_slot
  from public.availability_slots s
  where s.id = p_slot_id;
  if not found then
    raise exception 'slot not found' using errcode = 'P0002';
  end if;
  if v_slot.status <> 'open' then
    raise exception 'this date is not open for booking' using errcode = '55000';
  end if;
  v_starts_at := private.slot_starts_at(v_slot.starts_on, v_slot.start_time);
  if v_starts_at <= now() then
    raise exception 'this date has already started' using errcode = '55000';
  end if;
  if not private.is_experience_public(v_slot.experience_id) then
    raise exception 'this experience cannot be booked' using errcode = '55000';
  end if;

  select e.id, e.provider_id, e.price_from_minor, e.title into v_experience
  from public.experiences e where e.id = v_slot.experience_id;
  if private.is_provider_member(v_experience.provider_id) then
    raise exception 'you cannot book your own provider''s experience' using errcode = '42501';
  end if;
  -- Soft check: requests don't hold seats; confirmation re-checks under a lock.
  if v_slot.seats_confirmed + v_party > v_slot.capacity then
    raise exception 'not enough seats left on this date' using errcode = '55000';
  end if;

  v_reference := private.new_booking_reference();
  insert into public.bookings (
    reference, traveler_id, traveler_name, provider_id, experience_id, slot_id, experience_title,
    slot_starts_on, slot_start_time, adults, children, contact_phone,
    traveler_note, estimated_total_minor, request_expires_at, idempotency_key
  )
  values (
    v_reference, v_user_id,
    coalesce((select p.display_name from public.profiles p where p.id = v_user_id), 'Traveller'),
    v_experience.provider_id, v_experience.id, v_slot.id, v_experience.title,
    v_slot.starts_on, v_slot.start_time, p_adults,
    coalesce(p_children, 0), v_phone, v_note,
    case when v_experience.price_from_minor is null then null else v_experience.price_from_minor::bigint * v_party end,
    least(now() + interval '48 hours', v_starts_at),
    p_idempotency_key
  )
  on conflict on constraint bookings_idempotency_unique do nothing
  returning id into v_id;

  if v_id is null then
    -- A concurrent request with the same key won the race: return it.
    select b.id, b.reference, b.status into v_existing
    from public.bookings b
    where b.traveler_id = v_user_id and b.idempotency_key = p_idempotency_key;
    return query select v_existing.id, v_existing.reference, v_existing.status, true;
    return;
  end if;

  insert into public.booking_events (booking_id, from_status, to_status, actor_role, actor_id)
  values (v_id, null, 'requested', 'traveler', v_user_id);

  return query select v_id, v_reference, 'requested'::public.booking_status, false;
end;
$$;

create function public.respond_to_booking(
  p_booking_id uuid,
  p_decision public.booking_status,
  p_final_total_minor bigint,
  p_note text
)
returns public.booking_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_booking record;
  v_slot record;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select b.id, b.provider_id, b.slot_id, b.experience_id, b.status, b.party_size, b.request_expires_at
  into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;
  if not found or not private.is_provider_member(v_booking.provider_id) then
    raise exception 'booking not found' using errcode = 'P0002';
  end if;
  if not private.is_provider_verified(v_booking.provider_id) then
    raise exception 'only verified providers can respond to bookings' using errcode = '55000';
  end if;
  if v_booking.status <> 'requested' then
    raise exception 'this booking is %, not awaiting a response', v_booking.status using errcode = '55000';
  end if;
  if now() >= v_booking.request_expires_at then
    raise exception 'this request has expired' using errcode = '55000';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'note is too long' using errcode = '22023';
  end if;

  if p_decision = 'declined' then
    if v_note is null then
      raise exception 'a reason is required to decline' using errcode = '22023';
    end if;
    update public.bookings set status = 'declined', provider_note = v_note where id = v_booking.id;
  elsif p_decision = 'confirmed' then
    if p_final_total_minor is null or p_final_total_minor < 0 then
      raise exception 'a final total is required to confirm' using errcode = '22023';
    end if;
    -- Authoritative availability re-check, serialised per slot.
    select s.id, s.status, s.capacity, s.seats_confirmed, s.starts_on, s.start_time
    into v_slot
    from public.availability_slots s
    where s.id = v_booking.slot_id
    for update;
    if v_slot.status <> 'open' or private.slot_starts_at(v_slot.starts_on, v_slot.start_time) <= now() then
      raise exception 'this date is no longer available' using errcode = '55000';
    end if;
    if not private.is_experience_public(v_booking.experience_id) then
      raise exception 'this experience is no longer bookable' using errcode = '55000';
    end if;
    if v_slot.seats_confirmed + v_booking.party_size > v_slot.capacity then
      raise exception 'not enough seats left on this date' using errcode = '55000';
    end if;
    update public.availability_slots
    set seats_confirmed = seats_confirmed + v_booking.party_size
    where id = v_slot.id;
    update public.bookings
    set status = 'confirmed', confirmed_total_minor = p_final_total_minor, provider_note = v_note
    where id = v_booking.id;
  else
    raise exception 'decision must be confirmed or declined' using errcode = '22023';
  end if;

  insert into public.booking_events (booking_id, from_status, to_status, actor_role, actor_id, note)
  values (v_booking.id, 'requested', p_decision, 'provider', v_user_id, v_note);

  return p_decision;
end;
$$;

create function public.cancel_booking(p_booking_id uuid, p_reason text)
returns public.booking_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_booking record;
  v_slot record;
  v_actor public.booking_actor;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select b.id, b.traveler_id, b.provider_id, b.slot_id, b.status, b.party_size
  into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;
  if not found then
    raise exception 'booking not found' using errcode = 'P0002';
  end if;
  if v_booking.traveler_id = v_user_id then
    v_actor := 'traveler';
  elsif private.is_provider_member(v_booking.provider_id) then
    v_actor := 'provider';
  else
    raise exception 'booking not found' using errcode = 'P0002';
  end if;
  if v_reason is not null and char_length(v_reason) > 500 then
    raise exception 'reason is too long' using errcode = '22023';
  end if;

  if v_actor = 'traveler' then
    if v_booking.status not in ('requested', 'confirmed') then
      raise exception 'this booking is % and cannot be cancelled', v_booking.status using errcode = '55000';
    end if;
  else
    if v_booking.status <> 'confirmed' then
      raise exception 'providers can only cancel confirmed bookings; decline requests instead' using errcode = '55000';
    end if;
    if v_reason is null then
      raise exception 'a reason is required to cancel' using errcode = '22023';
    end if;
  end if;

  if v_booking.status = 'confirmed' then
    select s.id, s.starts_on, s.start_time into v_slot
    from public.availability_slots s where s.id = v_booking.slot_id for update;
    if v_actor = 'traveler'
       and private.slot_starts_at(v_slot.starts_on, v_slot.start_time) - now() < interval '24 hours' then
      raise exception 'confirmed bookings can only be cancelled up to 24 hours before the start' using errcode = '55000';
    end if;
    update public.availability_slots
    set seats_confirmed = seats_confirmed - v_booking.party_size
    where id = v_slot.id;
  end if;

  update public.bookings
  set status = 'cancelled', cancelled_by = v_actor, cancellation_reason = v_reason
  where id = v_booking.id;

  insert into public.booking_events (booking_id, from_status, to_status, actor_role, actor_id, note)
  values (v_booking.id, v_booking.status, 'cancelled', v_actor, v_user_id, v_reason);

  return 'cancelled';
end;
$$;

-- Materialises time-based transitions. Not exposed through the API; scheduled below.
create function private.sweep_bookings()
returns table (expired_count integer, completed_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expired integer;
  v_completed integer;
begin
  with expired as (
    update public.bookings b
    set status = 'expired'
    where b.status = 'requested' and b.request_expires_at <= now()
    returning b.id
  )
  insert into public.booking_events (booking_id, from_status, to_status, actor_role, note)
  select id, 'requested', 'expired', 'system', 'No response before the deadline.' from expired;
  get diagnostics v_expired = row_count;

  with completed as (
    update public.bookings b
    set status = 'completed'
    from public.availability_slots s
    where s.id = b.slot_id and b.status = 'confirmed' and s.starts_on < private.today_ist()
    returning b.id
  )
  insert into public.booking_events (booking_id, from_status, to_status, actor_role)
  select id, 'confirmed', 'completed', 'system' from completed;
  get diagnostics v_completed = row_count;

  return query select v_expired, v_completed;
end;
$$;

revoke all on function private.is_experience_public(uuid) from public;
revoke all on function private.is_experience_member(uuid) from public;
revoke all on function private.can_view_booking(uuid) from public;
revoke all on function private.today_ist() from public;
revoke all on function private.slot_starts_at(date, time) from public;
revoke all on function private.new_booking_reference() from public, anon, authenticated;
revoke all on function private.sweep_bookings() from public, anon, authenticated;
grant execute on function private.is_experience_public(uuid) to anon, authenticated;
grant execute on function private.is_experience_member(uuid) to authenticated;
grant execute on function private.can_view_booking(uuid) to authenticated;
grant execute on function private.today_ist() to anon, authenticated;

revoke all on function public.request_booking(uuid, integer, integer, text, text, uuid) from public, anon;
revoke all on function public.respond_to_booking(uuid, public.booking_status, bigint, text) from public, anon;
revoke all on function public.cancel_booking(uuid, text) from public, anon;
grant execute on function public.request_booking(uuid, integer, integer, text, text, uuid) to authenticated;
grant execute on function public.respond_to_booking(uuid, public.booking_status, bigint, text) to authenticated;
grant execute on function public.cancel_booking(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Scheduling: expire overdue requests and complete past bookings every 15 min.
-- Functions also enforce deadlines themselves, so a missed run never allows a
-- late confirmation.
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron;

select cron.schedule('himverse-booking-sweep', '*/15 * * * *', 'select private.sweep_bookings()');
