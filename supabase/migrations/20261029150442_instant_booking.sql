-- Instant booking (owner decision 2026-10-29; ADR-0004 and ADR-0005 amendments).
--
-- A new booking is confirmed in the same transaction that creates it, at the
-- listed price, with no partner response:
--   * capacity is taken under the same row locks as a partner confirmation
--     (private.confirm_booking), so a full date or listing refuses the booking;
--   * experiences are bookable only on dates the partner published as open
--     slots (seat-capped); guides, stays and transport use their daily capacity;
--   * when an admin requires deposits, the 50% deposit is due within 1 hour (or
--     by the start); unpaid bookings are cancelled by the sweep, which now runs
--     every 5 minutes and frees the capacity;
--   * when deposits are off, the booking is confirmed with nothing to pay online.
--
-- A listing with no price can't be priced instantly: its booking stays a
-- request and the partner confirms a total as before (respond_to_booking and
-- the price-approval step stay for those and for requests made before this
-- migration). The partner's "accepts bookings" switch still gates both booking
-- and the AI planner (private.is_experience_bookable).

-- Confirms a just-created request at its estimate. Returns the resulting status.
-- Called only from the request functions below, inside their transaction.
create function private.instant_confirm(p_booking_id uuid)
returns public.booking_status
language plpgsql
set search_path = ''
as $$
declare
  v_estimate bigint;
begin
  select b.estimated_total_minor into v_estimate from public.bookings b where b.id = p_booking_id;
  if v_estimate is null then
    return 'requested';
  end if;

  perform private.confirm_booking(p_booking_id, v_estimate, null, 'system', null);

  -- The deposit trigger allows 24 hours for partner confirmations; an instant
  -- booking holds capacity, so it gets 1 hour.
  update public.bookings b
  set payment_due_at = least(now() + interval '1 hour', private.slot_starts_at(b.slot_starts_on, b.slot_start_time))
  where b.id = p_booking_id and b.deposit_minor is not null and b.deposit_paid_at is null;
  return 'confirmed';
end;
$$;

revoke all on function private.instant_confirm(uuid) from public, anon, authenticated;

create or replace function private.create_booking_request(
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
    -- Lock the listing, then the slot, before inserting: the same order as
    -- private.confirm_booking. Otherwise each insert's foreign-key share lock on
    -- the slot blocks the other bookings' confirmation and they deadlock.
    perform 1 from public.experiences e where e.id = p_experience_id for no key update;
    select s.id, s.starts_on, s.start_time, s.capacity, s.seats_confirmed, s.status
    into v_slot
    from public.availability_slots s
    where s.id = p_slot_id and s.experience_id = p_experience_id
    for update;
    if not found or v_slot.status <> 'open' then
      raise exception 'this date is not available for booking' using errcode = 'P0002';
    end if;
    v_date := v_slot.starts_on;
    v_start_time := v_slot.start_time;
  else
    -- Instant booking: experiences are bookable only on dates the partner
    -- published as open slots, so seats are always capped.
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
  -- Early answer; the instant confirmation below re-checks under a lock.
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

  return query select v_id, v_reference, private.instant_confirm(v_id), false;
end;
$$;



create or replace function public.request_listing_booking(
  p_experience_id uuid,
  p_starts_on date,
  p_ends_on date,
  p_units integer,
  p_adults integer,
  p_children integer,
  p_contact_phone text,
  p_note text,
  p_pickup_note text,
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
  v_listing record;
  v_party integer;
  v_days integer;
  v_phone text := btrim(coalesce(p_contact_phone, ''));
  v_note text := btrim(coalesce(p_note, ''));
  v_pickup text := btrim(coalesce(p_pickup_note, ''));
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

  select e.id, e.provider_id, e.title, e.listing_type, e.price_unit, e.price_from_minor,
         e.daily_capacity, e.max_guests
  into v_listing
  from public.experiences e where e.id = p_experience_id;

  -- Experiences keep their own path (single date, optional seat-capped slots).
  -- Only for bookable ones, so hidden listings get the same answer as unknown
  -- ids (no existence oracle).
  if found and v_listing.listing_type = 'experience' and private.is_experience_bookable(p_experience_id) then
    if p_ends_on is not null and p_ends_on <> p_starts_on then
      raise exception 'experiences are booked for one date' using errcode = '22023';
    end if;
    return query select * from private.create_booking_request(
      v_user_id, p_experience_id, private.open_slot_on(p_experience_id, p_starts_on), p_starts_on,
      p_adults, p_children, p_contact_phone, p_note, p_idempotency_key);
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('booking-request:' || v_user_id::text, 0));

  select b.id, b.reference, b.status, b.experience_id, b.slot_starts_on, b.ends_on, b.units,
         b.adults, b.children, b.contact_phone
  into v_existing
  from public.bookings b
  where b.traveler_id = v_user_id and b.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.experience_id is distinct from p_experience_id
       or v_existing.slot_starts_on is distinct from p_starts_on
       or v_existing.ends_on is distinct from coalesce(p_ends_on, p_starts_on)
       or v_existing.units is distinct from p_units
       or v_existing.adults is distinct from p_adults
       or v_existing.children is distinct from coalesce(p_children, 0)
       or v_existing.contact_phone is distinct from v_phone then
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
  if char_length(v_note) > 500 or char_length(v_pickup) > 200 then
    raise exception 'note is too long' using errcode = '22023';
  end if;

  v_starts_at := private.slot_starts_at(p_starts_on, null);
  -- One answer for unknown, hidden, unbookable, past or too far ahead.
  if v_listing.id is null or p_starts_on is null or v_starts_at <= now()
     or p_starts_on > private.today_ist() + 730
     or not private.is_experience_bookable(p_experience_id) then
    raise exception 'this date is not available for booking' using errcode = 'P0002';
  end if;
  if p_ends_on is null or p_ends_on < p_starts_on then
    raise exception 'choose an end date on or after the start date' using errcode = '22023';
  end if;
  v_days := (p_ends_on - p_starts_on) + 1;

  if v_listing.listing_type = 'stay' and v_days > 30 then
    raise exception 'stays can be at most 30 nights' using errcode = '22023';
  elsif v_listing.listing_type in ('guide', 'transport') and v_days > 14 then
    raise exception 'at most 14 days per request' using errcode = '22023';
  end if;
  if v_listing.price_unit = 'per_vehicle_trip' and v_days <> 1 then
    raise exception 'a trip is booked for one date' using errcode = '22023';
  end if;
  if p_units is null or p_units < 1 or p_units > v_listing.daily_capacity then
    raise exception 'choose between 1 and % %', v_listing.daily_capacity,
      case v_listing.listing_type when 'stay' then 'rooms' when 'transport' then 'vehicles' else 'guides' end
      using errcode = '22023';
  end if;
  if v_party > p_units * v_listing.max_guests then
    raise exception 'too many people for % %: at most % each', p_units,
      case v_listing.listing_type when 'stay' then 'room(s)' when 'transport' then 'vehicle(s)' else 'guide(s)' end,
      v_listing.max_guests
      using errcode = '22023';
  end if;
  if private.is_provider_member(v_listing.provider_id) then
    raise exception 'you cannot book your own provider''s listing' using errcode = '42501';
  end if;
  -- Early answer; the instant confirmation below re-checks under a lock.
  if not private.listing_has_capacity(p_experience_id, p_starts_on, p_ends_on, p_units, v_listing.daily_capacity) then
    raise exception 'not enough availability on these dates' using errcode = '55000';
  end if;

  v_reference := private.new_booking_reference();
  insert into public.bookings (
    reference, traveler_id, traveler_name, provider_id, experience_id, slot_id, experience_title,
    slot_starts_on, ends_on, units, adults, children, contact_phone, traveler_note, pickup_note,
    estimated_total_minor, request_expires_at, idempotency_key
  )
  values (
    v_reference, v_user_id,
    coalesce((select p.display_name from public.profiles p where p.id = v_user_id), 'Traveller'),
    v_listing.provider_id, v_listing.id, null, v_listing.title,
    p_starts_on, p_ends_on, p_units, p_adults, coalesce(p_children, 0), v_phone, v_note, v_pickup,
    private.estimate_listing_total(v_listing.price_unit, v_listing.price_from_minor, v_party, p_units, v_days),
    least(now() + interval '48 hours', v_starts_at),
    p_idempotency_key
  )
  on conflict on constraint bookings_idempotency_unique do nothing
  returning id into v_id;

  if v_id is null then
    select b.id, b.reference, b.status into v_existing
    from public.bookings b
    where b.traveler_id = v_user_id and b.idempotency_key = p_idempotency_key;
    return query select v_existing.id, v_existing.reference, v_existing.status, true;
    return;
  end if;

  insert into public.booking_events (booking_id, from_status, to_status, actor_role, actor_id)
  values (v_id, null, 'requested', 'traveler', v_user_id);

  return query select v_id, v_reference, private.instant_confirm(v_id), false;
end;
$$;


-- An unpaid instant booking blocks capacity: sweep every 5 minutes, not 15.
select cron.unschedule('himverse-unpaid-deposits');
select cron.schedule('himverse-unpaid-deposits', '*/5 * * * *', 'select private.cancel_unpaid_bookings()');

-- Partners no longer answer most bookings, so the alert also counts instant
-- bookings made in the last 48 hours. A new column: drop and re-create, since
-- the return type changes (callers that read only the first two keep working).
drop function public.partner_booking_alerts();
create function public.partner_booking_alerts()
returns table (needs_response integer, expiring_soon integer, new_bookings integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(*) filter (where b.status = 'requested' and b.proposed_total_minor is null
                       and b.request_expires_at > now())::integer,
    count(*) filter (where b.status = 'requested' and b.proposed_total_minor is null
                       and b.request_expires_at > now()
                       and b.request_expires_at < now() + interval '12 hours')::integer,
    count(*) filter (where b.status = 'confirmed' and b.created_at > now() - interval '48 hours')::integer
  from public.bookings b
  where private.is_provider_member(b.provider_id)
    and (b.status = 'requested' or b.created_at > now() - interval '48 hours');
$$;

revoke all on function public.partner_booking_alerts() from public, anon;
grant execute on function public.partner_booking_alerts() to authenticated;

-- An instant confirmation is part of the traveller's own booking (same
-- transaction, so the same timestamp), not an update to tell them about.
create or replace function public.my_booking_updates()
returns table (booking_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct e.booking_id
  from public.booking_events e
  join public.bookings b on b.id = e.booking_id
  join public.profiles p on p.id = b.traveler_id
  where b.traveler_id = (select auth.uid())
    and e.actor_role <> 'traveler'
    and e.created_at > p.bookings_seen_at
    and not (e.actor_role = 'system' and e.to_status = 'confirmed' and e.created_at = b.created_at);
$$;
