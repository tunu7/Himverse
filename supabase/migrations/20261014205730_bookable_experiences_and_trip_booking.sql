-- Everything bookable (ADR-0004 amendment, 2026-10-15).
--
-- 1. Partners control bookability per experience: experiences.accepts_bookings
--    (default true). Only public experiences that accept bookings can be
--    requested, and the AI plans only with them.
-- 2. A bookable experience can be requested for any future date. A published
--    slot on that date is used when there is one (seat limits still apply);
--    otherwise the booking has no slot and the provider's confirmation is the
--    availability check. bookings.slot_starts_on / slot_start_time already
--    snapshot the date and are now the booking's date in both cases.
-- 3. request_itinerary_bookings: the owner of an itinerary requests every item
--    of a version in one call, each on its planned day, independently and
--    idempotently (per-item keys derived from one client key).
-- 4. confirm / cancel / sweep handle slot-less bookings; request limits are
--    raised so a whole trip fits (30/hour, 60/day, 40 awaiting a response).

-- ---------------------------------------------------------------------------
-- 1. Partner-controlled bookability
-- ---------------------------------------------------------------------------

alter table public.experiences
  add column accepts_bookings boolean not null default true;

-- Existing column-level grants (security_hardening) list columns explicitly.
grant select (accepts_bookings) on public.experiences to anon, authenticated;
grant insert (accepts_bookings), update (accepts_bookings) on public.experiences to authenticated;
-- Who may update is unchanged: provider members and admins (existing policies).

create function private.is_experience_bookable(p_experience_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_experience_public(p_experience_id)
    and exists (
      select 1 from public.experiences e where e.id = p_experience_id and e.accepts_bookings
    );
$$;

-- Used only inside security definer functions: not executable by API roles.
revoke all on function private.is_experience_bookable(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Bookings without a slot
-- ---------------------------------------------------------------------------

alter table public.bookings alter column slot_id drop not null;

-- At most one active request per traveler, experience and date when no slot
-- is involved (slot bookings keep bookings_one_active_per_slot_idx).
create unique index bookings_one_active_per_date_idx
  on public.bookings (traveler_id, experience_id, slot_starts_on)
  where slot_id is null and status in ('requested', 'confirmed');

-- The first open, upcoming slot of an experience on a date, if any.
create function private.open_slot_on(p_experience_id uuid, p_date date)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id
  from public.availability_slots s
  where s.experience_id = p_experience_id and s.starts_on = p_date and s.status = 'open'
    and private.slot_starts_at(s.starts_on, s.start_time) > now()
  order by s.start_time nulls first
  limit 1;
$$;

revoke all on function private.open_slot_on(uuid, date) from public, anon, authenticated;

-- Shared request logic. Not exposed: called by the public functions below,
-- which pass the authenticated user. Two call shapes:
--   slot request:  p_slot_id set, p_date null (request_booking)
--   date request:  p_date set, p_slot_id = the open slot on that date or null
-- A date request for a date that has only closed (or full-and-closed) slots is
-- refused: closing a date must keep meaning "not bookable".
create function private.create_booking_request(
  p_user_id uuid,
  p_experience_id uuid,
  p_slot_id uuid,
  p_date date,
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
  v_existing record;
  v_slot record;
  v_experience record;
  v_party integer;
  v_phone text := btrim(coalesce(p_contact_phone, ''));
  v_note text := btrim(coalesce(p_note, ''));
  v_date date := p_date;
  v_start_time time;
  v_starts_at timestamptz;
  v_id uuid;
  v_reference text;
begin
  if p_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency key required' using errcode = '22023';
  end if;

  -- Serialise each traveller's requests so concurrent calls can't slip past
  -- the request limits (checked by the insert trigger) or the replay lookup.
  perform pg_advisory_xact_lock(hashtextextended('booking-request:' || p_user_id::text, 0));

  -- Idempotent replay: the same key returns the original booking.
  select b.id, b.reference, b.status, b.slot_id, b.experience_id, b.slot_starts_on,
         b.adults, b.children, b.contact_phone
  into v_existing
  from public.bookings b
  where b.traveler_id = p_user_id and b.idempotency_key = p_idempotency_key;
  if found then
    -- A date request is identified by experience and date (a slot published or
    -- closed since the first call must not turn a retry into a mismatch); a
    -- slot request by its slot.
    if (p_date is null and v_existing.slot_id is distinct from p_slot_id)
       or (p_date is not null and (v_existing.experience_id is distinct from p_experience_id
                                   or v_existing.slot_starts_on is distinct from p_date))
       or v_existing.adults <> p_adults
       or v_existing.children <> coalesce(p_children, 0)
       or v_existing.contact_phone <> v_phone then
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

  if p_slot_id is not null then
    select s.id, s.starts_on, s.start_time, s.capacity, s.seats_confirmed, s.status
    into v_slot
    from public.availability_slots s
    where s.id = p_slot_id and s.experience_id = p_experience_id;
    if not found or v_slot.status <> 'open' then
      raise exception 'this date is not available for booking' using errcode = 'P0002';
    end if;
    v_date := v_slot.starts_on;
    v_start_time := v_slot.start_time;
  elsif exists (
    select 1 from public.availability_slots s
    where s.experience_id = p_experience_id and s.starts_on = v_date
  ) then
    -- The provider published this date and closed it (or it has started).
    raise exception 'this date is not available for booking' using errcode = 'P0002';
  end if;

  v_starts_at := private.slot_starts_at(v_date, v_start_time);
  -- One answer for unknown, hidden, unbookable, past or too far ahead (the
  -- same two-year horizon as provider slots): no existence oracle.
  if v_date is null or v_starts_at <= now() or v_date > private.today_ist() + 730
     or not private.is_experience_bookable(p_experience_id) then
    raise exception 'this date is not available for booking' using errcode = 'P0002';
  end if;

  select e.id, e.provider_id, e.price_from_minor, e.title into v_experience
  from public.experiences e where e.id = p_experience_id;
  if private.is_provider_member(v_experience.provider_id) then
    raise exception 'you cannot book your own provider''s experience' using errcode = '42501';
  end if;
  -- Soft check: requests don't hold seats; confirmation re-checks under a lock.
  if p_slot_id is not null then
    if v_slot.seats_confirmed + v_party > v_slot.capacity then
      raise exception 'not enough seats left on this date' using errcode = '55000';
    end if;
  end if;

  v_reference := private.new_booking_reference();
  insert into public.bookings (
    reference, traveler_id, traveler_name, provider_id, experience_id, slot_id, experience_title,
    slot_starts_on, slot_start_time, adults, children, contact_phone,
    traveler_note, estimated_total_minor, request_expires_at, idempotency_key
  )
  values (
    v_reference, p_user_id,
    coalesce((select p.display_name from public.profiles p where p.id = p_user_id), 'Traveller'),
    v_experience.provider_id, v_experience.id, p_slot_id, v_experience.title,
    v_date, v_start_time, p_adults,
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
    where b.traveler_id = p_user_id and b.idempotency_key = p_idempotency_key;
    return query select v_existing.id, v_existing.reference, v_existing.status, true;
    return;
  end if;

  insert into public.booking_events (booking_id, from_status, to_status, actor_role, actor_id)
  values (v_id, null, 'requested', 'traveler', p_user_id);

  return query select v_id, v_reference, 'requested'::public.booking_status, false;
end;
$$;

revoke all on function private.create_booking_request(uuid, uuid, uuid, date, integer, integer, text, text, uuid)
  from public, anon, authenticated;

-- Slot request (existing signature; now also requires accepts_bookings).
create or replace function public.request_booking(
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
  v_experience_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  -- An unknown slot leaves the experience null; create_booking_request then
  -- validates input first and answers like any unavailable date (no oracle).
  select s.experience_id into v_experience_id from public.availability_slots s where s.id = p_slot_id;
  if p_slot_id is null then
    raise exception 'this date is not available for booking' using errcode = 'P0002';
  end if;
  return query select * from private.create_booking_request(
    (select auth.uid()), v_experience_id, p_slot_id, null, p_adults, p_children,
    p_contact_phone, p_note, p_idempotency_key);
end;
$$;

-- Date request: uses an open slot on that date when one exists.
create function public.request_booking_on_date(
  p_experience_id uuid,
  p_date date,
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
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  return query select * from private.create_booking_request(
    (select auth.uid()), p_experience_id, private.open_slot_on(p_experience_id, p_date), p_date, p_adults, p_children,
    p_contact_phone, p_note, p_idempotency_key);
end;
$$;

revoke all on function public.request_booking_on_date(uuid, date, integer, integer, text, text, uuid) from public, anon;
grant execute on function public.request_booking_on_date(uuid, date, integer, integer, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Book a whole itinerary version
-- ---------------------------------------------------------------------------

-- Each item is requested independently (its own savepoint), so one unbookable
-- item doesn't block the rest; the result lists every item's outcome. Item
-- keys are derived from the client key, so a retry replays instead of
-- duplicating. Party and dates come from the stored version, not the client.
create function public.request_itinerary_bookings(
  p_version_id uuid,
  p_contact_phone text,
  p_note text,
  p_idempotency_key uuid
)
returns table (
  item_id uuid,
  booking_id uuid,
  booking_reference text,
  booking_status public.booking_status,
  replayed boolean,
  error_code text,
  error_message text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_version record;
  v_item record;
  v_start date;
  v_date date;
  v_adults integer;
  v_children integer;
  v_result record;
  v_state text;
  v_message text;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency key required' using errcode = '22023';
  end if;

  select v.id, v.preferences into v_version
  from public.itinerary_versions v
  join public.itineraries i on i.id = v.itinerary_id
  where v.id = p_version_id and i.owner_id = v_user_id;
  if not found then
    raise exception 'itinerary not found' using errcode = 'P0002';
  end if;

  begin
    v_start := (v_version.preferences ->> 'startDate')::date;
    v_adults := (v_version.preferences ->> 'adults')::integer;
    v_children := coalesce((v_version.preferences ->> 'children')::integer, 0);
  exception when others then
    raise exception 'this itinerary has no valid dates or travellers' using errcode = '22023';
  end;
  if v_start is null or v_adults is null then
    raise exception 'this itinerary has no valid dates or travellers' using errcode = '22023';
  end if;

  for v_item in
    select it.id, it.experience_id, it.day_number
    from public.itinerary_items it
    where it.version_id = v_version.id and it.experience_id is not null
    order by it.day_number, it.position
  loop
    begin
      v_date := v_start + (v_item.day_number - 1);
      -- Use an open slot on that date when there is one (seat limits apply).
      select * into v_result from private.create_booking_request(
        v_user_id, v_item.experience_id, private.open_slot_on(v_item.experience_id, v_date), v_date,
        v_adults, v_children, p_contact_phone, p_note,
        md5(p_idempotency_key::text || ':' || v_item.id::text)::uuid);
      return query select v_item.id, v_result.booking_id, v_result.booking_reference,
        v_result.booking_status, v_result.replayed, null::text, null::text;
    -- Only the refusals our functions raise are reported per item (their
    -- messages are ours). Anything else (deadlocks, internal errors) aborts
    -- the whole call so nothing is half-done silently and the app logs it.
    exception
      when sqlstate '22023' or sqlstate '42501' or sqlstate '54000' or sqlstate '55000'
           or sqlstate 'P0002' or sqlstate '23505' then
        get stacked diagnostics v_state = returned_sqlstate, v_message = message_text;
        return query select v_item.id, null::uuid, null::text, null::public.booking_status, null::boolean,
          v_state,
          case when v_state = '23505' then 'you already have an active booking for this date'
               else v_message end;
    end;
  end loop;
end;
$$;

revoke all on function public.request_itinerary_bookings(uuid, text, text, uuid) from public, anon;
grant execute on function public.request_itinerary_bookings(uuid, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Confirm, cancel and sweep for slot-less bookings
-- ---------------------------------------------------------------------------

create or replace function public.respond_to_booking(
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
  v_slot_id uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select b.id, b.provider_id, b.slot_id, b.experience_id, b.status, b.party_size, b.request_expires_at,
         b.slot_starts_on, b.slot_start_time
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
    if not private.is_experience_public(v_booking.experience_id) then
      raise exception 'this experience is no longer bookable' using errcode = '55000';
    end if;
    v_slot_id := v_booking.slot_id;
    if v_slot_id is null then
      -- Date request: the provider's confirmation is the availability check...
      if private.slot_starts_at(v_booking.slot_starts_on, v_booking.slot_start_time) <= now() then
        raise exception 'this date is no longer available' using errcode = '55000';
      end if;
      -- ...unless the provider has since published this date. Then the party
      -- counts against that slot (seat limits keep holding), and a date the
      -- provider closed can't be confirmed.
      v_slot_id := private.open_slot_on(v_booking.experience_id, v_booking.slot_starts_on);
      if v_slot_id is null and exists (
        select 1 from public.availability_slots s
        where s.experience_id = v_booking.experience_id and s.starts_on = v_booking.slot_starts_on
      ) then
        raise exception 'this date has been closed' using errcode = '55000';
      end if;
    end if;
    if v_slot_id is not null then
      -- Authoritative availability re-check, serialised per slot.
      select s.id, s.status, s.capacity, s.seats_confirmed, s.starts_on, s.start_time
      into v_slot
      from public.availability_slots s
      where s.id = v_slot_id
      for update;
      if v_slot.status <> 'open' or private.slot_starts_at(v_slot.starts_on, v_slot.start_time) <= now() then
        raise exception 'this date is no longer available' using errcode = '55000';
      end if;
      if v_slot.seats_confirmed + v_booking.party_size > v_slot.capacity then
        raise exception 'not enough seats left on this date' using errcode = '55000';
      end if;
      update public.availability_slots
      set seats_confirmed = seats_confirmed + v_booking.party_size
      where id = v_slot.id;
    end if;
    update public.bookings
    set status = 'confirmed', confirmed_total_minor = p_final_total_minor, provider_note = v_note
    where id = v_booking.id;
    if v_slot_id is not null and v_booking.slot_id is null then
      update public.bookings set slot_id = v_slot.id, slot_start_time = v_slot.start_time
      where id = v_booking.id;
    end if;
  else
    raise exception 'decision must be confirmed or declined' using errcode = '22023';
  end if;

  insert into public.booking_events (booking_id, from_status, to_status, actor_role, actor_id, note)
  values (v_booking.id, 'requested', p_decision, 'provider', v_user_id, v_note);

  return p_decision;
end;
$$;

create or replace function public.cancel_booking(p_booking_id uuid, p_reason text)
returns public.booking_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_booking record;
  v_actor public.booking_actor;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select b.id, b.traveler_id, b.provider_id, b.slot_id, b.status, b.party_size,
         b.slot_starts_on, b.slot_start_time
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
    -- The booking's date snapshot equals its slot's date (slot dates are immutable).
    if v_actor = 'traveler'
       and private.slot_starts_at(v_booking.slot_starts_on, v_booking.slot_start_time) - now() < interval '24 hours' then
      raise exception 'confirmed bookings can only be cancelled up to 24 hours before the start' using errcode = '55000';
    end if;
    if v_booking.slot_id is not null then
      perform 1 from public.availability_slots s where s.id = v_booking.slot_id for update;
      update public.availability_slots
      set seats_confirmed = seats_confirmed - v_booking.party_size
      where id = v_booking.slot_id;
    end if;
  end if;

  update public.bookings
  set status = 'cancelled', cancelled_by = v_actor, cancellation_reason = v_reason
  where id = v_booking.id;

  insert into public.booking_events (booking_id, from_status, to_status, actor_role, actor_id, note)
  values (v_booking.id, v_booking.status, 'cancelled', v_actor, v_user_id, v_reason);

  return 'cancelled';
end;
$$;

create or replace function private.sweep_bookings()
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
    -- The slot's date when there is one, else the booking's own date.
    update public.bookings b
    set status = 'completed'
    where b.status = 'confirmed'
      and coalesce(
        (select s.starts_on from public.availability_slots s where s.id = b.slot_id),
        b.slot_starts_on
      ) < private.today_ist()
    returning b.id
  )
  insert into public.booking_events (booking_id, from_status, to_status, actor_role)
  select id, 'confirmed', 'completed', 'system' from completed;
  get diagnostics v_completed = row_count;

  return query select v_expired, v_completed;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Request limits sized for whole-trip booking
-- ---------------------------------------------------------------------------

create or replace function private.enforce_booking_request_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last_hour integer;
  v_last_day integer;
  v_open integer;
begin
  select
    count(*) filter (where b.created_at > now() - interval '1 hour'),
    count(*) filter (where b.created_at > now() - interval '24 hours'),
    count(*) filter (where b.status = 'requested')
  into v_last_hour, v_last_day, v_open
  from public.bookings b
  where b.traveler_id = new.traveler_id;

  if v_last_hour >= 30 or v_last_day >= 60 then
    raise exception 'you have made too many booking requests; please try again later' using errcode = '54000';
  end if;
  if v_open >= 40 then
    raise exception 'you have too many requests awaiting a response; wait for replies or cancel some' using errcode = '54000';
  end if;
  return new;
end;
$$;
