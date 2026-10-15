-- AI itineraries with stays and transport (ADR-0008, Phase 3b), plus the
-- Phase 3a security review follow-ups.
--
-- Itinerary items gain a kind: an activity (an experience, as before), the
-- night's stay, or the day's transport leg, each with a quantity (rooms or
-- vehicles, computed by the server from the number of travellers).
-- save_itinerary_version validates each kind against the database (type,
-- visibility, bookable, destination and route) and prices it by its unit;
-- request_itinerary_bookings books consecutive nights at one stay as a single
-- stay booking and each transport leg on its own.

-- ---------------------------------------------------------------------------
-- 3a review follow-ups
-- ---------------------------------------------------------------------------

-- Languages: a flat list of short, non-empty words; routes go somewhere else.
create function private.valid_languages(p_languages text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (array_ndims(p_languages) is null or array_ndims(p_languages) = 1)
    and array_position(p_languages, null) is null
    and not exists (
      select 1 from unnest(p_languages) as l(word) where char_length(btrim(l.word)) not between 1 and 30
    );
$$;

-- Check constraints run as the writing role (partners, admins, service jobs), so
-- every role must be able to call it. It is pure and reveals nothing.
grant execute on function private.valid_languages(text[]) to public;

-- NOT VALID: enforced on every new insert and update without failing the deploy on
-- an existing row. VALIDATE once the owner has confirmed none violate (see ADR-0008):
--   select id from public.experiences
--   where route_to_destination_id = destination_id or not private.valid_languages(languages);
alter table public.experiences
  add constraint experiences_languages_items check (private.valid_languages(languages)) not valid,
  add constraint experiences_route_elsewhere check (
    route_to_destination_id is null or route_to_destination_id <> destination_id
  ) not valid;

-- Hidden experiences get the same answer as unknown ids; NULL-safe replay checks.
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


-- Partner listing edits and FK inserts no longer queue behind confirmations.
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
    -- NO KEY UPDATE: serialises confirmations and partner edits of the listing
    -- without blocking inserts that merely reference it (bookings, items).
    select e.listing_type, e.daily_capacity into v_listing
    from public.experiences e where e.id = v_booking.experience_id
    for no key update;

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


-- ---------------------------------------------------------------------------
-- Itinerary item kinds
-- ---------------------------------------------------------------------------

create type public.itinerary_item_kind as enum ('activity', 'stay', 'transport');

alter table public.itinerary_items
  add column item_kind public.itinerary_item_kind not null default 'activity',
  add column units integer not null default 1
    constraint itinerary_items_units_range check (units between 1 and 50);

-- Same signature: the app passes item_kind and units inside p_items.
create or replace function public.save_itinerary_version(
  p_generation_id bigint,
  p_itinerary_id uuid,
  p_title text,
  p_kind public.itinerary_version_kind,
  p_preferences jsonb,
  p_plan jsonb,
  p_schema_version text,
  p_prompt_version text,
  p_model text,
  p_travelers integer,
  p_warnings jsonb,
  p_items jsonb
)
returns table (itinerary_id uuid, version_id uuid, version_number integer, estimated_total_minor bigint, unpriced_item_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_itinerary_id uuid := p_itinerary_id;
  v_version_id uuid;
  v_version_number integer;
  v_item_count integer;
  v_activity_count integer;
  v_valid_count integer;
  v_total bigint;
  v_unpriced integer;
  v_generation_ok boolean;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'items must be an array' using errcode = '22023';
  end if;
  v_item_count := jsonb_array_length(p_items);
  if v_item_count < 1 or v_item_count > 100 then
    raise exception 'an itinerary needs between 1 and 100 items' using errcode = '22023';
  end if;
  if p_travelers is null or p_travelers < 1 or p_travelers > 12 then
    raise exception 'travelers must be between 1 and 12' using errcode = '22023';
  end if;
  if p_travelers <> coalesce((p_preferences ->> 'adults')::integer, 0) + coalesce((p_preferences ->> 'children')::integer, 0) then
    raise exception 'travelers do not match the preferences' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as x(item_kind text, units integer)
    where coalesce(x.item_kind, 'activity') not in ('activity', 'stay', 'transport')
       or coalesce(x.units, 1) not between 1 and 50
  ) then
    raise exception 'invalid item kind or quantity' using errcode = '22023';
  end if;
  -- No activity twice; at most one stay and one transport leg per day.
  select count(*) into v_activity_count
  from jsonb_to_recordset(p_items) as x(item_kind text) where coalesce(x.item_kind, 'activity') = 'activity';
  if (select count(distinct x.experience_id) from jsonb_to_recordset(p_items) as x(experience_id uuid, item_kind text)
      where coalesce(x.item_kind, 'activity') = 'activity') <> v_activity_count then
    raise exception 'an experience appears more than once' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as x(day_number integer, item_kind text)
    where x.item_kind in ('stay', 'transport')
    group by x.day_number, x.item_kind having count(*) > 1
  ) then
    raise exception 'at most one stay and one transport leg per day' using errcode = '22023';
  end if;
  -- The trip ends on its last day: no stay that night.
  if exists (
    select 1 from jsonb_to_recordset(p_items) as x(day_number integer, item_kind text)
    where x.item_kind = 'stay'
      and x.day_number >= jsonb_array_length(coalesce(p_plan -> 'days', '[]'::jsonb))
  ) then
    raise exception 'no stay after the last night of the trip' using errcode = '22023';
  end if;

  select true into v_generation_ok
  from public.itinerary_generations g
  where g.id = p_generation_id and g.user_id = v_user_id and g.outcome = 'pending'
    and g.created_at > now() - interval '15 minutes'
  for update;
  if not coalesce(v_generation_ok, false) then
    raise exception 'no matching itinerary generation in progress' using errcode = '55000';
  end if;

  if v_itinerary_id is null then
    insert into public.itineraries (owner_id, title)
    values (v_user_id, btrim(p_title))
    returning id into v_itinerary_id;
  else
    perform 1 from public.itineraries i
    where i.id = v_itinerary_id and i.owner_id = v_user_id
    for update;
    if not found then
      raise exception 'itinerary not found' using errcode = 'P0002';
    end if;
  end if;

  -- Every item must be a bookable listing of the right type, now:
  --   activity  an experience at the day's destination
  --   stay      a stay at the day's destination, rooms within its capacity and
  --             enough for the party
  --   transport a vehicle route arriving at the day's destination, or day hire there,
  --             vehicles within its capacity and enough for the party
  select count(*) into v_valid_count
  from jsonb_to_recordset(p_items) as x(experience_id uuid, destination_id uuid, item_kind text, units integer)
  join public.experiences e on e.id = x.experience_id
  where private.is_experience_bookable(e.id)
    and case coalesce(x.item_kind, 'activity')
      when 'activity' then e.listing_type = 'experience' and e.destination_id = x.destination_id
      when 'stay' then e.listing_type = 'stay' and e.destination_id = x.destination_id
        and coalesce(x.units, 1) <= e.daily_capacity
        and coalesce(x.units, 1) * e.max_guests >= p_travelers
      when 'transport' then e.listing_type = 'transport'
        and coalesce(e.route_to_destination_id, e.destination_id) = x.destination_id
        and coalesce(x.units, 1) <= e.daily_capacity
        and coalesce(x.units, 1) * e.max_guests >= p_travelers
    end;
  if v_valid_count <> v_item_count then
    raise exception 'one or more listings are not available' using errcode = '55000';
  end if;

  select coalesce(max(v.version_number), 0) + 1 into v_version_number
  from public.itinerary_versions v where v.itinerary_id = v_itinerary_id;

  -- Activities per person; a stay night per room; a transport leg per vehicle.
  select
    coalesce(sum(
      case coalesce(x.item_kind, 'activity')
        when 'activity' then e.price_from_minor::bigint * p_travelers
        else e.price_from_minor::bigint * coalesce(x.units, 1)
      end
    ), 0),
    count(*) filter (where e.price_from_minor is null)
  into v_total, v_unpriced
  from jsonb_to_recordset(p_items) as x(experience_id uuid, item_kind text, units integer)
  join public.experiences e on e.id = x.experience_id;

  insert into public.itinerary_versions (
    itinerary_id, version_number, kind, preferences, plan, schema_version, prompt_version, model,
    travelers, estimated_total_minor, unpriced_item_count, warnings
  )
  values (
    v_itinerary_id, v_version_number, p_kind, p_preferences, p_plan, p_schema_version, p_prompt_version,
    p_model, p_travelers, v_total, v_unpriced, coalesce(p_warnings, '[]'::jsonb)
  )
  returning id into v_version_id;

  insert into public.itinerary_items (
    version_id, day_number, position, experience_id, destination_id, experience_title_snapshot,
    destination_name_snapshot, time_of_day, rationale, price_snapshot_minor, duration_snapshot_minutes,
    item_kind, units
  )
  select
    v_version_id, x.day_number, x.position, e.id, d.id, e.title, d.name, x.time_of_day,
    left(coalesce(x.rationale, ''), 500), e.price_from_minor, e.duration_minutes,
    coalesce(x.item_kind, 'activity')::public.itinerary_item_kind, coalesce(x.units, 1)
  from jsonb_to_recordset(p_items) as x(
    day_number integer, position integer, experience_id uuid, destination_id uuid,
    time_of_day public.itinerary_time_of_day, rationale text, item_kind text, units integer
  )
  join public.experiences e on e.id = x.experience_id
  join public.destinations d on d.id = x.destination_id;

  update public.itineraries i
  set current_version_id = v_version_id
  where i.id = v_itinerary_id;

  update public.itinerary_generations g
  set outcome = 'succeeded', itinerary_id = v_itinerary_id
  where g.id = p_generation_id;

  return query select v_itinerary_id, v_version_id, v_version_number, v_total, v_unpriced;
end;
$$;

-- ---------------------------------------------------------------------------
-- Whole-trip booking with stays and transport
-- ---------------------------------------------------------------------------

create or replace function public.request_itinerary_bookings(
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

  -- One request per activity and transport leg; consecutive nights at the
  -- same stay (same rooms) become one stay request. Each group's key is
  -- derived from its first item, so a retry replays it.
  for v_item in
    with items as (
      select it.id, it.experience_id, it.day_number, it.position, it.item_kind, it.units,
             it.day_number - row_number() over (
               partition by it.item_kind, it.experience_id, it.units order by it.day_number
             ) as run
      from public.itinerary_items it
      where it.version_id = v_version.id and it.experience_id is not null
    )
    select (array_agg(i.id order by i.day_number))[1] as first_id,
           array_agg(i.id order by i.day_number) as ids,
           i.experience_id, i.item_kind, i.units,
           min(i.day_number) as first_day, max(i.day_number) as last_day,
           min(i.position) as position
    from items i
    group by i.experience_id, i.item_kind, i.units,
             case when i.item_kind = 'stay' then i.run::text else i.id::text end
    order by min(i.day_number), min(i.position)
  loop
    begin
      if v_item.item_kind = 'activity' then
        select * into v_result from private.create_booking_request(
          v_user_id, v_item.experience_id,
          private.open_slot_on(v_item.experience_id, v_start + (v_item.first_day - 1)),
          v_start + (v_item.first_day - 1),
          v_adults, v_children, p_contact_phone, p_note,
          md5(p_idempotency_key::text || ':' || v_item.first_id::text)::uuid);
      else
        select * into v_result from public.request_listing_booking(
          v_item.experience_id, v_start + (v_item.first_day - 1), v_start + (v_item.last_day - 1),
          v_item.units, v_adults, v_children, p_contact_phone, p_note, '',
          md5(p_idempotency_key::text || ':' || v_item.first_id::text)::uuid);
      end if;
      return query select unnest(v_item.ids), v_result.booking_id, v_result.booking_reference,
        v_result.booking_status, v_result.replayed, null::text, null::text;
    exception
      when sqlstate '22023' or sqlstate '42501' or sqlstate '54000' or sqlstate '55000'
           or sqlstate 'P0002' or sqlstate '23505' then
        get stacked diagnostics v_state = returned_sqlstate, v_message = message_text;
        return query select unnest(v_item.ids), null::uuid, null::text, null::public.booking_status, null::boolean,
          v_state,
          case when v_state = '23505' then 'you already have an active booking for this date'
               else v_message end;
    end;
  end loop;
end;
$$;
