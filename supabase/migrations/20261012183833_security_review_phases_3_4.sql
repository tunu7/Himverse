-- Fixes from the security review of Phases 3-4 (reports/tasks/2026-10-13-phase5-production-readiness.md).
--
-- M1  Itinerary limits were checked before the model call but recorded after it,
--     so parallel requests could all pass. Generations are now RESERVED first:
--     begin_itinerary_generation() serialises per user (advisory lock), applies the
--     per-user and platform limits, and inserts a 'pending' row that counts at once.
--     finish_itinerary_generation() records the outcome. Rows that never finish
--     (e.g. a killed function) keep counting: fail closed.
-- M2  save_itinerary_version() now requires a pending generation reserved by the
--     caller in the last 15 minutes and consumes it; travellers must match the
--     preferences; duplicate experiences are rejected.
-- M3  Only verified providers' members can add dates, at most two years ahead;
--     at most 200 experiences per provider.
-- L1  Provider-confirmed totals are capped (INR 1 crore), matching the form.
-- L2  booking_events.actor_id is no longer selectable by API roles.
-- L4  request_booking answers "not available" (P0002) for any date that isn't
--     publicly bookable: no existence oracle.

alter type public.itinerary_generation_outcome add value if not exists 'pending' before 'succeeded';

-- ---------------------------------------------------------------------------
-- M1: reserve before calling the model
-- ---------------------------------------------------------------------------

create function public.begin_itinerary_generation(p_itinerary_id uuid, p_global_daily_limit integer)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_last_hour integer;
  v_last_day integer;
  v_id bigint;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  -- Serialise this user's reservations so parallel requests can't all pass the check.
  perform pg_advisory_xact_lock(hashtextextended('itinerary-generation:' || v_user_id::text, 0));

  select
    count(*) filter (where g.created_at > now() - interval '1 hour'),
    count(*) filter (where g.created_at > now() - interval '24 hours')
  into v_last_hour, v_last_day
  from public.itinerary_generations g
  where g.user_id = v_user_id;
  -- Mirrors GENERATION_LIMITS in src/server/itineraries/pipeline.ts.
  if v_last_hour >= 10 or v_last_day >= 30 then
    raise exception 'you have reached the itinerary limit; please try again later' using errcode = '54000';
  end if;
  if p_global_daily_limit is not null and public.ai_generations_today() >= p_global_daily_limit then
    raise exception 'trip planning is very busy today; please try again tomorrow' using errcode = '54000';
  end if;

  insert into public.itinerary_generations (user_id, itinerary_id, outcome)
  values (v_user_id, case when p_itinerary_id is not null and private.owns_itinerary(p_itinerary_id) then p_itinerary_id end, 'pending')
  returning id into v_id;
  return v_id;
end;
$$;

create function public.finish_itinerary_generation(
  p_generation_id bigint,
  p_outcome public.itinerary_generation_outcome,
  p_error_code text,
  p_model text,
  p_prompt_version text,
  p_latency_ms integer,
  p_input_tokens integer,
  p_output_tokens integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_outcome = 'pending' then
    raise exception 'outcome must be final' using errcode = '22023';
  end if;
  -- Only the caller's own row; 'succeeded' rows were already finalised by the save.
  update public.itinerary_generations g
  set outcome = case when g.outcome = 'pending' then p_outcome else g.outcome end,
      error_code = left(p_error_code, 60),
      model = left(p_model, 100),
      prompt_version = left(p_prompt_version, 40),
      latency_ms = greatest(p_latency_ms, 0),
      input_tokens = greatest(p_input_tokens, 0),
      output_tokens = greatest(p_output_tokens, 0)
  where g.id = p_generation_id and g.user_id = v_user_id;
end;
$$;

drop function public.record_itinerary_generation(uuid, public.itinerary_generation_outcome, text, text, text, integer, integer, integer);

revoke all on function public.begin_itinerary_generation(uuid, integer) from public, anon;
revoke all on function public.finish_itinerary_generation(bigint, public.itinerary_generation_outcome, text, text, text, integer, integer, integer) from public, anon;
grant execute on function public.begin_itinerary_generation(uuid, integer) to authenticated;
grant execute on function public.finish_itinerary_generation(bigint, public.itinerary_generation_outcome, text, text, text, integer, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- M2: save requires a reserved generation
-- ---------------------------------------------------------------------------

drop function public.save_itinerary_version(uuid, text, public.itinerary_version_kind, jsonb, jsonb, text, text, text, integer, jsonb, jsonb);

create function public.save_itinerary_version(
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
  if v_item_count < 1 or v_item_count > 60 then
    raise exception 'an itinerary needs between 1 and 60 items' using errcode = '22023';
  end if;
  if p_travelers is null or p_travelers < 1 or p_travelers > 12 then
    raise exception 'travelers must be between 1 and 12' using errcode = '22023';
  end if;
  -- Travellers must match the stored preferences.
  if p_travelers <> coalesce((p_preferences ->> 'adults')::integer, 0) + coalesce((p_preferences ->> 'children')::integer, 0) then
    raise exception 'travelers do not match the preferences' using errcode = '22023';
  end if;
  -- No experience twice in one plan.
  if (select count(distinct x.experience_id) from jsonb_to_recordset(p_items) as x(experience_id uuid)) <> v_item_count then
    raise exception 'an experience appears more than once' using errcode = '22023';
  end if;

  -- Every save must consume a generation the caller reserved (rate-limited) in the
  -- last 15 minutes, so direct RPC calls can't bypass generation limits (review M2).
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
      -- Same answer whether missing or someone else's: no existence oracle.
      raise exception 'itinerary not found' using errcode = 'P0002';
    end if;
  end if;

  -- Every referenced experience must be publicly visible now, at the stated destination.
  select count(*) into v_valid_count
  from jsonb_to_recordset(p_items) as x(experience_id uuid, destination_id uuid)
  join public.experiences e on e.id = x.experience_id and e.destination_id = x.destination_id
  where e.status = 'published'
    and private.is_provider_verified(e.provider_id)
    and private.is_destination_published(e.destination_id);
  if v_valid_count <> v_item_count then
    raise exception 'one or more experiences are not available' using errcode = '55000';
  end if;

  select coalesce(max(v.version_number), 0) + 1 into v_version_number
  from public.itinerary_versions v where v.itinerary_id = v_itinerary_id;

  select
    coalesce(sum(e.price_from_minor), 0) * p_travelers,
    count(*) filter (where e.price_from_minor is null)
  into v_total, v_unpriced
  from jsonb_to_recordset(p_items) as x(experience_id uuid)
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
    destination_name_snapshot, time_of_day, rationale, price_snapshot_minor, duration_snapshot_minutes
  )
  select
    v_version_id, x.day_number, x.position, e.id, d.id, e.title, d.name, x.time_of_day,
    left(coalesce(x.rationale, ''), 500), e.price_from_minor, e.duration_minutes
  from jsonb_to_recordset(p_items) as x(
    day_number integer, position integer, experience_id uuid, time_of_day public.itinerary_time_of_day, rationale text
  )
  join public.experiences e on e.id = x.experience_id
  join public.destinations d on d.id = e.destination_id;

  update public.itineraries i
  set current_version_id = v_version_id
  where i.id = v_itinerary_id;

  update public.itinerary_generations g
  set outcome = 'succeeded', itinerary_id = v_itinerary_id
  where g.id = p_generation_id;

  return query select v_itinerary_id, v_version_id, v_version_number, v_total, v_unpriced;
end;
$$;

revoke all on function public.save_itinerary_version(bigint, uuid, text, public.itinerary_version_kind, jsonb, jsonb, text, text, text, integer, jsonb, jsonb) from public, anon;
grant execute on function public.save_itinerary_version(bigint, uuid, text, public.itinerary_version_kind, jsonb, jsonb, text, text, text, integer, jsonb, jsonb) to authenticated;


-- ---------------------------------------------------------------------------
-- M3: dates only for verified providers, at most two years ahead; experience cap
-- ---------------------------------------------------------------------------

drop policy "provider members add upcoming slots" on public.availability_slots;
create policy "verified provider members add upcoming slots"
  on public.availability_slots for insert to authenticated
  with check (
    private.is_experience_member(experience_id)
    and exists (
      select 1 from public.experiences e
      where e.id = experience_id and private.is_provider_verified(e.provider_id)
    )
    and starts_on between private.today_ist() and private.today_ist() + 730
  );

create function private.enforce_experience_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.experiences e where e.provider_id = new.provider_id) >= 200 then
    raise exception 'this provider already has the maximum number of experiences' using errcode = '54000';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_experience_limits() from public, anon, authenticated;

create trigger experiences_enforce_limits
  before insert on public.experiences
  for each row execute function private.enforce_experience_limits();

-- ---------------------------------------------------------------------------
-- L1: cap provider-confirmed totals; L2: hide actor ids from booking parties
-- ---------------------------------------------------------------------------

alter table public.bookings
  add constraint bookings_confirmed_total_cap check (confirmed_total_minor <= 1000000000);

revoke select on public.booking_events from authenticated;
grant select (id, booking_id, from_status, to_status, actor_role, note, created_at)
  on public.booking_events to authenticated;

-- ---------------------------------------------------------------------------
-- L4: no existence oracle in request_booking
-- ---------------------------------------------------------------------------

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
  v_starts_at := private.slot_starts_at(v_slot.starts_on, v_slot.start_time);
  -- One answer for missing, closed, past or non-public dates: no existence oracle.
  if not found or v_slot.status <> 'open' or v_starts_at <= now()
     or not private.is_experience_public(v_slot.experience_id) then
    raise exception 'this date is not available for booking' using errcode = 'P0002';
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
