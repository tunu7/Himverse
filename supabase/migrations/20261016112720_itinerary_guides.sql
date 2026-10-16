-- Guides in AI itineraries and whole-trip booking (owner decisions 2026-10-16):
-- the planner suggests a bookable guide at each day's base when the traveller
-- keeps "Suggest a local guide" on (optionally speaking a chosen language);
-- consecutive days with the same guide become one guide booking.
--
-- Same signatures as before; only the item kinds, checks, pricing and grouping
-- change. A guide day is priced by its listing's own unit: per group per day
-- (x guides) or per person per day (x travellers), as private.estimate_listing_total.

-- Positions per day: activities 1-6, the night's stay 7, transport 8, the guide 9.
alter table public.itinerary_items
  drop constraint itinerary_items_position_range,
  add constraint itinerary_items_position_range check (position between 1 and 9);

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
    where coalesce(x.item_kind, 'activity') not in ('activity', 'stay', 'transport', 'guide')
       or coalesce(x.units, 1) not between 1 and 50
  ) then
    raise exception 'invalid item kind or quantity' using errcode = '22023';
  end if;
  -- No activity twice; at most one stay, one transport leg and one guide per day.
  select count(*) into v_activity_count
  from jsonb_to_recordset(p_items) as x(item_kind text) where coalesce(x.item_kind, 'activity') = 'activity';
  if (select count(distinct x.experience_id) from jsonb_to_recordset(p_items) as x(experience_id uuid, item_kind text)
      where coalesce(x.item_kind, 'activity') = 'activity') <> v_activity_count then
    raise exception 'an experience appears more than once' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as x(day_number integer, item_kind text)
    where x.item_kind in ('stay', 'transport', 'guide')
    group by x.day_number, x.item_kind having count(*) > 1
  ) then
    raise exception 'at most one stay, transport leg and guide per day' using errcode = '22023';
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
  --   guide     a guide at the day's destination, guides within its capacity and
  --             enough for the party
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
      when 'guide' then e.listing_type = 'guide' and e.destination_id = x.destination_id
        and coalesce(x.units, 1) <= e.daily_capacity
        and coalesce(x.units, 1) * e.max_guests >= p_travelers
    end;
  if v_valid_count <> v_item_count then
    raise exception 'one or more listings are not available' using errcode = '55000';
  end if;

  select coalesce(max(v.version_number), 0) + 1 into v_version_number
  from public.itinerary_versions v where v.itinerary_id = v_itinerary_id;

  -- Activities per person; a stay night per room; a transport leg per vehicle;
  -- a guide day by its own price unit (per group or per person, ADR-0008).
  select
    coalesce(sum(
      case coalesce(x.item_kind, 'activity')
        when 'activity' then e.price_from_minor::bigint * p_travelers
        when 'guide' then private.estimate_listing_total(e.price_unit, e.price_from_minor, p_travelers, coalesce(x.units, 1), 1)
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
  -- same stay (same rooms), and consecutive days with the same guide (same
  -- number of guides), become one request. Each group's key is derived from its
  -- first item, so a retry replays it.
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
             case when i.item_kind in ('stay', 'guide') then i.run::text else i.id::text end
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
