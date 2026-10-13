-- Regression tests for the Phase 3-4 security review fixes
-- (migration 20261012183833_security_review_phases_3_4). Parallel reservation
-- behaviour (M1) is covered by tests/integration/itinerary-reservations.test.ts.
begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

truncate public.booking_events, public.bookings, public.availability_slots, public.itinerary_items,
  public.experiences, public.destinations, public.provider_status_events,
  public.provider_private_details, public.provider_members, public.providers;

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-4111-8111-111111111111', 'a@example.test', 'authenticated', 'authenticated'),
  ('22222222-2222-4222-8222-222222222222', 'b@example.test', 'authenticated', 'authenticated'),
  ('33333333-3333-4333-8333-333333333333', 'verified.owner@example.test', 'authenticated', 'authenticated'),
  ('44444444-4444-4444-8444-444444444444', 'draft.owner@example.test', 'authenticated', 'authenticated');
insert into public.providers (id, slug, display_name, status, verified_at) values
  ('a0000000-0000-4000-8000-000000000001', 'verified-co', 'Verified Co', 'verified', now()),
  ('a0000000-0000-4000-8000-000000000002', 'draft-co', 'Draft Co', 'draft', null);
insert into public.provider_members (provider_id, user_id) values
  ('a0000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333'),
  ('a0000000-0000-4000-8000-000000000002', '44444444-4444-4444-8444-444444444444');
insert into public.destinations (id, slug, name, district, is_published)
values ('d0000000-0000-4000-8000-000000000001', 'ziro', 'Ziro', 'Lower Subansiri', true);
insert into public.experiences (id, provider_id, destination_id, slug, title, category, duration_minutes, price_from_minor, status) values
  ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'walk', 'Walk', 'culture', 60, 100000, 'published'),
  ('e0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'draft-walk', 'Draft walk', 'culture', 60, 100000, 'draft');

-- M2: saves must consume a fresh, own, pending generation ----------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.save_itinerary_version(null, null, 'T', 'generate', '{"adults":1}', '{}', 'itinerary.v1', 'x', 'mock', 1, '[]',
       '[{"day_number":1,"position":1,"experience_id":"e0000000-0000-4000-8000-000000000001","destination_id":"d0000000-0000-4000-8000-000000000001","time_of_day":"morning","rationale":""}]') $$,
  '55000', null, 'a save without a reserved generation is refused (direct RPC calls cannot bypass limits)');
select lives_ok($$ select set_config('test.gen', public.begin_itinerary_generation(null, null)::text, true) $$, 'reserve a generation');
select lives_ok(
  $$ select * from public.save_itinerary_version(current_setting('test.gen')::bigint, null, 'T', 'generate', '{"adults":1}', '{}', 'itinerary.v1', 'x', 'mock', 1, '[]',
       '[{"day_number":1,"position":1,"experience_id":"e0000000-0000-4000-8000-000000000001","destination_id":"d0000000-0000-4000-8000-000000000001","time_of_day":"morning","rationale":""}]') $$,
  'a save with the reserved generation succeeds');
select throws_ok(
  $$ select * from public.save_itinerary_version(current_setting('test.gen')::bigint, null, 'T2', 'generate', '{"adults":1}', '{}', 'itinerary.v1', 'x', 'mock', 1, '[]',
       '[{"day_number":1,"position":1,"experience_id":"e0000000-0000-4000-8000-000000000001","destination_id":"d0000000-0000-4000-8000-000000000001","time_of_day":"morning","rationale":""}]') $$,
  '55000', null, 'a generation can only be used for one save');
select is((select outcome::text from public.itinerary_generations where id = current_setting('test.gen')::bigint), 'succeeded', 'the save marks its generation succeeded');
select throws_ok(
  $$ select * from public.save_itinerary_version(public.begin_itinerary_generation(null, null), null, 'T', 'generate', '{"adults":2}', '{}', 'itinerary.v1', 'x', 'mock', 1, '[]',
       '[{"day_number":1,"position":1,"experience_id":"e0000000-0000-4000-8000-000000000001","destination_id":"d0000000-0000-4000-8000-000000000001","time_of_day":"morning","rationale":""}]') $$,
  '22023', null, 'travellers must match the preferences');
select throws_ok(
  $$ select * from public.save_itinerary_version(public.begin_itinerary_generation(null, null), null, 'T', 'generate', '{"adults":1}', '{}', 'itinerary.v1', 'x', 'mock', 1, '[]',
       '[{"day_number":1,"position":1,"experience_id":"e0000000-0000-4000-8000-000000000001","destination_id":"d0000000-0000-4000-8000-000000000001","time_of_day":"morning","rationale":""},
         {"day_number":1,"position":2,"experience_id":"e0000000-0000-4000-8000-000000000001","destination_id":"d0000000-0000-4000-8000-000000000001","time_of_day":"evening","rationale":""}]') $$,
  '22023', null, 'the same experience cannot appear twice');

-- Another user's or a stale reservation can't be used
reset role;
with stale as (
  insert into public.itinerary_generations (user_id, outcome, created_at)
  values ('11111111-1111-4111-8111-111111111111', 'pending', now() - interval '20 minutes') returning id)
select set_config('test.stale', (select id from stale)::text, true);
set local role authenticated;
select throws_ok(
  $$ select * from public.save_itinerary_version(current_setting('test.stale')::bigint, null, 'T', 'generate', '{"adults":1}', '{}', 'itinerary.v1', 'x', 'mock', 1, '[]',
       '[{"day_number":1,"position":1,"experience_id":"e0000000-0000-4000-8000-000000000001","destination_id":"d0000000-0000-4000-8000-000000000001","time_of_day":"morning","rationale":""}]') $$,
  '55000', null, 'a reservation older than 15 minutes cannot be used');
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.save_itinerary_version(
       (select max(id) from public.itinerary_generations), null, 'T', 'generate', '{"adults":1}', '{}', 'itinerary.v1', 'x', 'mock', 1, '[]',
       '[{"day_number":1,"position":1,"experience_id":"e0000000-0000-4000-8000-000000000001","destination_id":"d0000000-0000-4000-8000-000000000001","time_of_day":"morning","rationale":""}]') $$,
  '55000', null, 'another user''s reservation cannot be used');

-- M1: the per-user limit counts reservations immediately --------------------------------
select lives_ok($$ select public.begin_itinerary_generation(null, null) from generate_series(1, 10) $$, 'ten reservations in an hour are allowed');
select throws_ok($$ select public.begin_itinerary_generation(null, null) $$, '54000', null, 'the eleventh reservation in an hour is refused');

-- M3: dates only for verified providers, at most two years ahead ---------------------------
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
select throws_ok(
  $$ insert into public.availability_slots (experience_id, starts_on, capacity) values ('e0000000-0000-4000-8000-000000000002', private.today_ist() + 10, 5) $$,
  '42501', null, 'members of unverified providers cannot add dates');
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
select throws_ok(
  $$ insert into public.availability_slots (experience_id, starts_on, capacity) values ('e0000000-0000-4000-8000-000000000001', private.today_ist() + 731, 5) $$,
  '42501', null, 'dates more than two years ahead are refused');

-- L2: actor ids are not readable ------------------------------------------------------
select throws_ok($$ select actor_id from public.booking_events $$, '42501', null, 'booking parties cannot read actor ids');

select * from finish();
rollback;
