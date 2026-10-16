-- Traveller approval for large price increases (owner decision 2026-10-15;
-- BOOKING_POLICY question 9, security review L1).
--
-- A partner's final total up to 10% above the estimate confirms as before. A
-- higher total, or any total when the request had no estimate, becomes a
-- proposal: the booking stays 'requested' with proposed_total_minor set, and
-- the traveller has 48 hours (or until the start, if sooner) to accept it.
-- Accepting re-checks availability and confirms; declining is the existing
-- traveller cancellation. Unanswered proposals expire through the sweep.
--
-- No new status, so request limits, the one-active-booking indexes and the
-- expiry sweep keep working unchanged.

alter table public.bookings
  add column proposed_total_minor bigint
    constraint bookings_proposed_total_range check (proposed_total_minor between 0 and 1000000000),
  add column price_proposed_at timestamptz,
  add constraint bookings_proposal_complete
    check ((proposed_total_minor is null) = (price_proposed_at is null));
-- Readable through the existing table-level select grant; no write grant.

-- More than 10% above the estimate, or no estimate at all.
create function private.price_needs_approval(p_estimate_minor bigint, p_final_minor bigint)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_estimate_minor is null or p_final_minor * 10 > p_estimate_minor * 11;
$$;

-- Confirms a locked, still-requested booking: checks the listing and date,
-- takes capacity, sets the total and logs the event. Shared by the partner's
-- direct confirmation and the traveller's acceptance of a proposed price.
-- Callers authorise the actor; the status re-check under the row lock guards
-- against double-counting capacity if a future caller forgets theirs.
create function private.confirm_booking(
  p_booking_id uuid,
  p_total_minor bigint,
  p_note text,
  p_actor public.booking_actor,
  p_actor_id uuid
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_booking record;
  v_listing record;
  v_slot record;
  v_slot_id uuid;
begin
  -- Runs only inside the security definer callers (no API role can execute it).
  select b.id, b.status, b.slot_id, b.experience_id, b.party_size, b.slot_starts_on, b.slot_start_time,
         b.ends_on, b.units
  into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;
  if not found or v_booking.status <> 'requested' then
    raise exception 'this booking is not awaiting confirmation' using errcode = '55000';
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
  set status = 'confirmed',
      confirmed_total_minor = p_total_minor,
      provider_note = coalesce(p_note, provider_note)
  where id = v_booking.id;
  if v_slot_id is not null and v_booking.slot_id is null then
    update public.bookings set slot_id = v_slot.id, slot_start_time = v_slot.start_time
    where id = v_booking.id;
  end if;

  insert into public.booking_events (booking_id, from_status, to_status, actor_role, actor_id, note)
  values (v_booking.id, 'requested', 'confirmed', p_actor, p_actor_id, p_note);
end;
$$;

revoke all on function private.price_needs_approval(bigint, bigint) from public, anon, authenticated;
revoke all on function private.confirm_booking(uuid, bigint, text, public.booking_actor, uuid) from public, anon, authenticated;

-- Partner response: decline, confirm, or (above the threshold) propose a price.
-- Returns 'requested' when the total was proposed to the traveller.
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
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select b.id, b.provider_id, b.experience_id, b.status, b.request_expires_at, b.estimated_total_minor,
         b.proposed_total_minor, b.slot_starts_on, b.slot_start_time
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
    insert into public.booking_events (booking_id, from_status, to_status, actor_role, actor_id, note)
    values (v_booking.id, 'requested', 'declined', 'provider', v_user_id, v_note);
    return 'declined';
  elsif p_decision = 'confirmed' then
    -- Idempotent replay: the same total was already proposed.
    if v_booking.proposed_total_minor = p_final_total_minor then
      return 'requested';
    end if;
    if v_booking.proposed_total_minor is not null then
      raise exception 'this booking is waiting for the traveller to accept your price' using errcode = '55000';
    end if;
    if p_final_total_minor is null or p_final_total_minor < 0 then
      raise exception 'a final total is required to confirm' using errcode = '22023';
    end if;
    if p_final_total_minor > 1000000000 then
      raise exception 'the final total is too large' using errcode = '22023';
    end if;

    if private.price_needs_approval(v_booking.estimated_total_minor, p_final_total_minor) then
      if not private.is_experience_public(v_booking.experience_id) then
        raise exception 'this listing is no longer bookable' using errcode = '55000';
      end if;
      if private.slot_starts_at(v_booking.slot_starts_on, v_booking.slot_start_time) <= now() then
        raise exception 'this date is no longer available' using errcode = '55000';
      end if;
      update public.bookings
      set proposed_total_minor = p_final_total_minor,
          price_proposed_at = now(),
          provider_note = v_note,
          request_expires_at = least(
            now() + interval '48 hours',
            private.slot_starts_at(v_booking.slot_starts_on, v_booking.slot_start_time)
          )
      where id = v_booking.id;
      insert into public.booking_events (booking_id, from_status, to_status, actor_role, actor_id, note)
      values (v_booking.id, 'requested', 'requested', 'provider', v_user_id,
              left('Proposed a new total for your approval.' || coalesce(' ' || v_note, ''), 500));
      return 'requested';
    end if;

    perform private.confirm_booking(v_booking.id, p_final_total_minor, v_note, 'provider', v_user_id);
    return 'confirmed';
  else
    raise exception 'decision must be confirmed or declined' using errcode = '22023';
  end if;
end;
$$;

-- Traveller accepts the proposed total. p_total_minor must equal the proposal
-- the traveller saw. A retry after success returns 'confirmed' again.
create function public.accept_booking_price(p_booking_id uuid, p_total_minor bigint)
returns public.booking_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_booking record;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select b.id, b.traveler_id, b.provider_id, b.status, b.request_expires_at,
         b.proposed_total_minor, b.confirmed_total_minor
  into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;
  if not found or v_booking.traveler_id is distinct from v_user_id then
    raise exception 'booking not found' using errcode = 'P0002';
  end if;

  -- Idempotent replay: already accepted at this total.
  if v_booking.status = 'confirmed'
     and v_booking.proposed_total_minor = p_total_minor
     and v_booking.confirmed_total_minor = p_total_minor then
    return 'confirmed';
  end if;

  if v_booking.status <> 'requested' or v_booking.proposed_total_minor is null then
    raise exception 'there is no price waiting for your approval' using errcode = '55000';
  end if;
  if now() >= v_booking.request_expires_at then
    raise exception 'this price proposal has expired' using errcode = '55000';
  end if;
  if p_total_minor is distinct from v_booking.proposed_total_minor then
    raise exception 'the proposed total has changed; reload the booking' using errcode = '22023';
  end if;
  if not private.is_provider_verified(v_booking.provider_id) then
    raise exception 'this provider can''t take bookings right now' using errcode = '55000';
  end if;

  perform private.confirm_booking(v_booking.id, v_booking.proposed_total_minor, null, 'traveler', v_user_id);
  return 'confirmed';
end;
$$;

revoke all on function public.accept_booking_price(uuid, bigint) from public, anon;
grant execute on function public.accept_booking_price(uuid, bigint) to authenticated;

-- Unanswered proposals expire like unanswered requests, with their own note.
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
    returning b.id, b.proposed_total_minor
  )
  insert into public.booking_events (booking_id, from_status, to_status, actor_role, note)
  select id, 'requested', 'expired', 'system',
         case when proposed_total_minor is null
              then 'No response before the deadline.'
              else 'The traveller didn''t accept the proposed price before the deadline.' end
  from expired;
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

-- A proposal waits on the traveller, not the partner.
create or replace function public.partner_booking_alerts()
returns table (needs_response integer, expiring_soon integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(*)::integer,
    count(*) filter (where b.request_expires_at < now() + interval '12 hours')::integer
  from public.bookings b
  where b.status = 'requested'
    and b.proposed_total_minor is null
    and b.request_expires_at > now()
    and private.is_provider_member(b.provider_id);
$$;
