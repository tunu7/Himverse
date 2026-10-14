-- Abuse limits and the global AI usage counter (migration 20261012183454).
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

truncate public.booking_events, public.bookings, public.availability_slots, public.itinerary_items,
  public.experiences, public.destinations, public.provider_status_events,
  public.provider_private_details, public.provider_members, public.providers;

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-4111-8111-111111111111', 'busy.traveler@example.test', 'authenticated', 'authenticated'),
  ('33333333-3333-4333-8333-333333333333', 'owner@example.test', 'authenticated', 'authenticated');
insert into public.providers (id, slug, display_name, status, verified_at)
values ('a0000000-0000-4000-8000-000000000001', 'limits-co', 'Limits Co', 'verified', now());
insert into public.provider_members (provider_id, user_id)
values ('a0000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333');
insert into public.destinations (id, slug, name, district, is_published)
values ('d0000000-0000-4000-8000-000000000001', 'limits-town', 'Limits Town', 'Tawang', true);
insert into public.experiences (id, provider_id, destination_id, slug, title, category, duration_minutes, price_from_minor, status)
values ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'limits-walk', 'Limits walk', 'culture', 60, 1000, 'published');
-- 45 future dates so the one-active-booking-per-slot rule doesn't interfere.
insert into public.availability_slots (experience_id, starts_on, capacity)
select 'e0000000-0000-4000-8000-000000000001', private.today_ist() + n, 5 from generate_series(10, 54) as n;

-- Booking request rate ------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select lives_ok(
  $$ select count(*) from (
       select public.request_booking(s.id, 1, 0, '+91 98765 43210', '', gen_random_uuid())
       from public.availability_slots s order by s.starts_on limit 30) as made $$,
  'thirty booking requests in an hour are allowed (a whole trip fits)');
select throws_ok(
  $$ select * from public.request_booking(
       (select id from public.availability_slots order by starts_on desc limit 1), 1, 0, '+91 98765 43210', '', gen_random_uuid()) $$,
  '54000', null, 'the thirty-first request within an hour is refused');

-- Too many unanswered requests (older than the hourly/daily windows)
reset role;
delete from public.bookings;
insert into public.bookings (reference, traveler_id, traveler_name, provider_id, experience_id, slot_id, experience_title,
  slot_starts_on, adults, contact_phone, request_expires_at, idempotency_key, created_at)
select 'HV-' || upper(substr(md5(n::text), 1, 6)), '11111111-1111-4111-8111-111111111111', 'x',
  'a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001',
  (select id from public.availability_slots order by starts_on limit 1 offset (n - 1)),
  'Limits walk', private.today_ist() + 10, 1, '+91 98765 43210', now() + interval '1 day', gen_random_uuid(), now() - interval '3 days'
from generate_series(1, 40) as n;
set local role authenticated;
select throws_ok(
  $$ select * from public.request_booking(
       (select id from public.availability_slots order by starts_on desc limit 1), 1, 0, '+91 98765 43210', '', gen_random_uuid()) $$,
  '54000', null, 'a traveler with 40 unanswered requests must wait');

-- Provider applications --------------------------------------------------------------
select lives_ok(
  $$ select public.create_provider_application('limits-a-' || n, 'Applicant ' || n, '', null, 'Applicant Ltd', 'a@example.test', null)
     from generate_series(1, 3) as n $$,
  'three applications in a day are allowed');
select throws_ok(
  $$ select public.create_provider_application('limits-a-4', 'Applicant 4', '', null, 'Applicant Ltd', 'a@example.test', null) $$,
  '54000', null, 'the fourth application in a day is refused');

-- Open dates per experience -------------------------------------------------------
reset role;
insert into public.availability_slots (experience_id, starts_on, capacity)
select 'e0000000-0000-4000-8000-000000000001', private.today_ist() + n, 5 from generate_series(55, 375) as n; -- 45 + 321 = exactly 366 open dates
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
select throws_ok(
  $$ insert into public.availability_slots (experience_id, starts_on, capacity)
     values ('e0000000-0000-4000-8000-000000000001', private.today_ist() + 500, 5) $$,
  '54000', null, 'an experience cannot exceed 366 open future dates');

-- Global AI usage counter ----------------------------------------------------------
reset role;
insert into public.itinerary_generations (user_id, outcome, created_at) values
  ('11111111-1111-4111-8111-111111111111', 'succeeded', now()),
  ('33333333-3333-4333-8333-333333333333', 'failed_upstream', now()),
  ('33333333-3333-4333-8333-333333333333', 'succeeded', now() - interval '2 days');
set local role authenticated;
select is((select public.ai_generations_today()), 2, 'counts today''s generations across all users');
select is_empty($$ select 1 from public.itinerary_generations where user_id = '11111111-1111-4111-8111-111111111111' $$,
  'the counter does not expose other users'' rows (caller still sees only their own log)');
reset role;
set local role anon;
select throws_ok($$ select public.ai_generations_today() $$, '42501', null, 'anon cannot read the AI usage counter');

select * from finish();
rollback;
