-- Phase 5: abuse limits for authenticated write paths, and a global AI usage counter.
--
-- Limits are enforced by BEFORE INSERT triggers keyed on the acting user, so they
-- apply to every path (RPCs and direct inserts) and can't be spoofed. They raise
-- SQLSTATE 54000 (program_limit_exceeded), mapped to RATE_LIMITED in the app.
-- Values are provisional; see docs/security/SECURITY.md (Rate limits).
--
-- Sign-in/sign-up are deliberately NOT limited here: an anon-callable limiter
-- would let anyone exhaust another person's quota. Use Supabase Auth's CAPTCHA
-- and built-in limits instead (release checklist).

-- Booking requests per traveler -------------------------------------------------------
create function private.enforce_booking_request_limits()
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

  if v_last_hour >= 10 or v_last_day >= 30 then
    raise exception 'you have made too many booking requests; please try again later' using errcode = '54000';
  end if;
  if v_open >= 20 then
    raise exception 'you have too many requests awaiting a response; wait for replies or cancel some' using errcode = '54000';
  end if;
  return new;
end;
$$;

create trigger bookings_enforce_request_limits
  before insert on public.bookings
  for each row execute function private.enforce_booking_request_limits();

-- Provider applications per user --------------------------------------------------------
create function private.enforce_provider_application_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last_day integer;
  v_unverified integer;
begin
  if new.created_by is null then
    return new; -- operator inserts (e.g. seed) are not rate limited
  end if;
  select
    count(*) filter (where p.created_at > now() - interval '24 hours'),
    count(*) filter (where p.status in ('draft', 'pending_review', 'rejected'))
  into v_last_day, v_unverified
  from public.providers p
  where p.created_by = new.created_by;

  if v_last_day >= 3 then
    raise exception 'too many provider applications today; please try again tomorrow' using errcode = '54000';
  end if;
  if v_unverified >= 5 then
    raise exception 'you already have several applications in progress' using errcode = '54000';
  end if;
  return new;
end;
$$;

create trigger providers_enforce_application_limits
  before insert on public.providers
  for each row execute function private.enforce_provider_application_limits();

-- Open future dates per experience -------------------------------------------------
create function private.enforce_slot_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    select count(*) from public.availability_slots s
    where s.experience_id = new.experience_id and s.status = 'open' and s.starts_on >= private.today_ist()
  ) >= 366 then
    raise exception 'this experience already has the maximum number of open dates' using errcode = '54000';
  end if;
  return new;
end;
$$;

create trigger availability_slots_enforce_limits
  before insert on public.availability_slots
  for each row execute function private.enforce_slot_limits();

revoke all on function private.enforce_booking_request_limits() from public, anon, authenticated;
revoke all on function private.enforce_provider_application_limits() from public, anon, authenticated;
revoke all on function private.enforce_slot_limits() from public, anon, authenticated;

-- Global AI usage ---------------------------------------------------------------------
-- Number of model-calling itinerary generations today (IST) across all users, so
-- the server can enforce a platform-wide daily cap. Returns only an aggregate.
create function public.ai_generations_today()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.itinerary_generations g
  where g.created_at >= (private.today_ist()::timestamp at time zone 'Asia/Kolkata');
$$;

revoke all on function public.ai_generations_today() from public, anon;
grant execute on function public.ai_generations_today() to authenticated;
