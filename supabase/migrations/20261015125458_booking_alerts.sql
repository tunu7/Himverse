-- In-app booking alerts (Phase 4, launch readiness). No email yet: travellers
-- see which bookings changed since they last opened "My bookings", and partners
-- see requests waiting for a reply and those about to expire.

-- When the traveller last looked at their bookings. Existing accounts start
-- "now" so they aren't shown old history as new. Readable under the existing
-- profile policies (a timestamp, not personal data); API roles can't update it
-- (only display_name is updatable), so it changes only through mark_bookings_seen().
alter table public.profiles add column bookings_seen_at timestamptz not null default now();

-- The caller's bookings that a partner or the system changed since they last looked.
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
    and e.created_at > p.bookings_seen_at;
$$;

create or replace function public.mark_bookings_seen()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set bookings_seen_at = now() where id = (select auth.uid());
$$;

-- Open requests for the caller's businesses (after two-step login, like every
-- partner read), and how many expire within 12 hours.
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
    and b.request_expires_at > now()
    and private.is_provider_member(b.provider_id);
$$;

revoke all on function public.my_booking_updates() from public, anon;
revoke all on function public.mark_bookings_seen() from public, anon;
revoke all on function public.partner_booking_alerts() from public, anon;
grant execute on function public.my_booking_updates() to authenticated;
grant execute on function public.mark_bookings_seen() to authenticated;
grant execute on function public.partner_booking_alerts() to authenticated;
