-- Partner listing types (ADR-0008, Phase 3a).
--
-- `experiences` becomes the generic listings table (the name stays to avoid a
-- risky rename; the UI says "listing"). Each listing has a type and a price
-- unit, and the type-specific fields below:
--
--   type        price units                         capacity (daily_capacity)   max_guests
--   experience  per_person                          optional dated slots        -
--   guide       per_group_day | per_person_day      guides available per day    group size per guide
--   stay        per_room_night                      rooms of this room type     guests per room
--   transport   per_vehicle_trip | per_vehicle_day  vehicles available per day  seats per vehicle
--
-- A stay is one room type (owner decision). Transport is private vehicle hire
-- from the listing's destination to `route_to_destination_id` (or around it
-- for day hire). Bookings of non-experience listings carry a date range
-- (`slot_starts_on` .. `ends_on`, inclusive service days; a stay's last night
-- is `ends_on`) and `units` (guides, rooms or vehicles). The database computes
-- the estimate and, on confirmation, checks capacity for every day under a
-- row lock on the listing, so confirmed bookings never exceed it.

create type public.listing_type as enum ('experience', 'guide', 'stay', 'transport');
create type public.price_unit as enum (
  'per_person', 'per_group_day', 'per_person_day', 'per_room_night', 'per_vehicle_trip', 'per_vehicle_day'
);

alter table public.experiences
  add column listing_type public.listing_type not null default 'experience',
  add column price_unit public.price_unit not null default 'per_person',
  add column daily_capacity integer
    constraint experiences_daily_capacity_range check (daily_capacity between 1 and 500),
  add column max_guests integer
    constraint experiences_max_guests_range check (max_guests between 1 and 50),
  add column languages text[] not null default '{}'
    constraint experiences_languages_shape check (
      cardinality(languages) <= 10 and array_to_string(languages, '') !~ '[<>]'
      and coalesce(char_length(array_to_string(languages, ',')), 0) <= 300
    ),
  add column route_to_destination_id uuid references public.destinations (id) on delete restrict,
  add constraint experiences_type_fields check (
    case listing_type
      when 'experience' then price_unit = 'per_person'
      when 'guide' then price_unit in ('per_group_day', 'per_person_day')
        and daily_capacity is not null and max_guests is not null
      when 'stay' then price_unit = 'per_room_night'
        and daily_capacity is not null and max_guests is not null
      when 'transport' then price_unit in ('per_vehicle_trip', 'per_vehicle_day')
        and daily_capacity is not null and max_guests is not null
    end
  ),
  add constraint experiences_route_only_transport check (
    route_to_destination_id is null or listing_type = 'transport'
  );

create index experiences_listing_type_idx on public.experiences (listing_type, status);
create index experiences_route_to_destination_id_idx on public.experiences (route_to_destination_id);

-- Same column-level grant pattern as the rest of the table.
grant select (listing_type, price_unit, daily_capacity, max_guests, languages, route_to_destination_id)
  on public.experiences to anon, authenticated;
grant insert (listing_type, price_unit, daily_capacity, max_guests, languages, route_to_destination_id),
  update (price_unit, daily_capacity, max_guests, languages, route_to_destination_id)
  on public.experiences to authenticated;
-- listing_type is set at creation only: a stay can't turn into a transport listing.

-- Dated slots with seat caps are an experience feature.
create function private.enforce_slots_for_experiences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.experiences e
    where e.id = new.experience_id and e.listing_type <> 'experience'
  ) then
    raise exception 'dated slots are only for experiences; set daily capacity instead' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_slots_for_experiences() from public, anon, authenticated;

create trigger availability_slots_experiences_only
  before insert on public.availability_slots
  for each row execute function private.enforce_slots_for_experiences();

-- ---------------------------------------------------------------------------
-- Bookings: date ranges and units
-- ---------------------------------------------------------------------------

alter table public.bookings
  add column ends_on date,
  add column units integer not null default 1
    constraint bookings_units_range check (units between 1 and 50),
  add column pickup_note text not null default ''
    constraint bookings_pickup_note_length check (char_length(pickup_note) <= 200),
  add constraint bookings_ends_after_start check (ends_on is null or ends_on >= slot_starts_on);

-- Non-experience listings are booked only through request_listing_booking,
-- which always sets the date range.
create function private.enforce_listing_booking_shape()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.ends_on is null and exists (
    select 1 from public.experiences e
    where e.id = new.experience_id and e.listing_type <> 'experience'
  ) then
    raise exception 'this listing is booked with dates and quantities' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_listing_booking_shape() from public, anon, authenticated;

create trigger bookings_b_listing_shape
  before insert on public.bookings
  for each row execute function private.enforce_listing_booking_shape();

-- Units of confirmed bookings of a listing covering a day.
create function private.listing_units_booked(p_experience_id uuid, p_day date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(b.units), 0)::integer
  from public.bookings b
  where b.experience_id = p_experience_id
    and b.status = 'confirmed'
    and b.slot_starts_on <= p_day
    and coalesce(b.ends_on, b.slot_starts_on) >= p_day;
$$;

-- Whether `p_units` more fit on every day from p_from to p_to.
create function private.listing_has_capacity(
  p_experience_id uuid, p_from date, p_to date, p_units integer, p_capacity integer
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from generate_series(p_from, p_to, interval '1 day') as d(day)
    where private.listing_units_booked(p_experience_id, d.day::date) + p_units > p_capacity
  );
$$;

-- The database's estimate for a request (minor units), or null when unpriced.
create function private.estimate_listing_total(
  p_unit public.price_unit, p_price integer, p_party integer, p_units integer, p_days integer
)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case
    when p_price is null then null
    when p_unit = 'per_person' then p_price::bigint * p_party
    when p_unit = 'per_person_day' then p_price::bigint * p_party * p_days
    when p_unit in ('per_group_day', 'per_room_night', 'per_vehicle_day') then p_price::bigint * p_units * p_days
    when p_unit = 'per_vehicle_trip' then p_price::bigint * p_units
  end;
$$;

revoke all on function private.listing_units_booked(uuid, date) from public, anon, authenticated;
revoke all on function private.listing_has_capacity(uuid, date, date, integer, integer) from public, anon, authenticated;
revoke all on function private.estimate_listing_total(public.price_unit, integer, integer, integer, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Requesting a guide, stay or transport listing
-- ---------------------------------------------------------------------------

create function public.request_listing_booking(
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
  if found and v_listing.listing_type = 'experience' then
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
  if char_length(v_note) > 500 or char_length(v_pickup) > 200 then
    raise exception 'note is too long' using errcode = '22023';
  end if;

  v_starts_at := private.slot_starts_at(p_starts_on, null);
  -- One answer for unknown, hidden, unbookable, past or too far ahead.
  if v_listing.id is null or p_starts_on is null or v_starts_at <= now()
     or p_starts_on > private.today_ist() + 730
     or not private.is_experience_bookable(p_experience_id) then
    raise exception 'these dates are not available for booking' using errcode = 'P0002';
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
  -- Soft check: requests don't hold capacity; confirmation re-checks under a lock.
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

  return query select v_id, v_reference, 'requested'::public.booking_status, false;
end;
$$;

revoke all on function public.request_listing_booking(uuid, date, date, integer, integer, integer, text, text, text, uuid) from public, anon;
grant execute on function public.request_listing_booking(uuid, date, date, integer, integer, integer, text, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Confirmation checks capacity for guides, stays and transport
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
  v_listing record;
  v_slot record;
  v_slot_id uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select b.id, b.provider_id, b.slot_id, b.experience_id, b.status, b.party_size, b.request_expires_at,
         b.slot_starts_on, b.slot_start_time, b.ends_on, b.units
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
      raise exception 'this listing is no longer bookable' using errcode = '55000';
    end if;
    if private.slot_starts_at(v_booking.slot_starts_on, v_booking.slot_start_time) <= now() then
      raise exception 'this date is no longer available' using errcode = '55000';
    end if;

    -- Serialise confirmations per listing, then check what it can still take.
    select e.listing_type, e.daily_capacity into v_listing
    from public.experiences e where e.id = v_booking.experience_id
    for update;

    if v_listing.listing_type <> 'experience' then
      if not private.listing_has_capacity(
        v_booking.experience_id, v_booking.slot_starts_on,
        coalesce(v_booking.ends_on, v_booking.slot_starts_on), v_booking.units, v_listing.daily_capacity
      ) then
        raise exception 'not enough availability on these dates' using errcode = '55000';
      end if;
    else
      v_slot_id := v_booking.slot_id;
      if v_slot_id is null then
        -- An experience date published after the request: the party counts
        -- against that slot; a date the provider closed can't be confirmed.
        v_slot_id := private.open_slot_on(v_booking.experience_id, v_booking.slot_starts_on);
        if v_slot_id is null and exists (
          select 1 from public.availability_slots s
          where s.experience_id = v_booking.experience_id and s.starts_on = v_booking.slot_starts_on
        ) then
          raise exception 'this date has been closed' using errcode = '55000';
        end if;
      end if;
      if v_slot_id is not null then
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

-- Completed after the last service day (a stay's last night, a multi-day hire's last day).
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
    update public.bookings b
    set status = 'completed'
    where b.status = 'confirmed'
      and coalesce(
        (select s.starts_on from public.availability_slots s where s.id = b.slot_id),
        b.ends_on,
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
