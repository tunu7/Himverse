-- Phase 3b (migration itinerary_stays_transport): itinerary items of kind stay and
-- transport, validated and priced by the database; whole-trip booking groups
-- consecutive nights. Also the Phase 3a security review's test gaps.
begin;
create extension if not exists pgtap with schema extensions;

select plan(26);

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('e1111111-1111-4111-8111-111111111111', 'is.traveller@example.test', 'authenticated', 'authenticated', '{"account_type":"traveller"}'),
  ('e3333333-3333-4333-8333-333333333333', 'is.partner@example.test', 'authenticated', 'authenticated', '{"account_type":"partner"}');
insert into public.providers (id, slug, display_name, status, verified_at)
values ('ec000000-0000-4000-8000-000000000001', 'is-provider', 'IS Provider', 'verified', now());
insert into public.provider_members (provider_id, user_id)
values ('ec000000-0000-4000-8000-000000000001', 'e3333333-3333-4333-8333-333333333333');
insert into public.destinations (id, slug, name, district, is_published) values
  ('ed000000-0000-4000-8000-000000000001', 'is-ziro', 'IS Ziro', 'Lower Subansiri', true),
  ('ed000000-0000-4000-8000-000000000002', 'is-tawang', 'IS Tawang', 'Tawang', true);
insert into public.experiences (id, provider_id, destination_id, slug, title, category, duration_minutes, price_from_minor, status,
  listing_type, price_unit, daily_capacity, max_guests, route_to_destination_id) values
  ('ee000000-0000-4000-8000-000000000001', 'ec000000-0000-4000-8000-000000000001', 'ed000000-0000-4000-8000-000000000001',
   'is-walk', 'IS walk', 'culture', 120, 100000, 'published', 'experience', 'per_person', null, null, null),
  ('ee000000-0000-4000-8000-000000000002', 'ec000000-0000-4000-8000-000000000001', 'ed000000-0000-4000-8000-000000000001',
   'is-room', 'IS room', 'culture', 1440, 300000, 'published', 'stay', 'per_room_night', 3, 2, null),
  ('ee000000-0000-4000-8000-000000000003', 'ec000000-0000-4000-8000-000000000001', 'ed000000-0000-4000-8000-000000000001',
   'is-suv', 'IS SUV to Tawang', 'adventure', 600, 900000, 'published', 'transport', 'per_vehicle_trip', 2, 6, 'ed000000-0000-4000-8000-000000000002'),
  ('ee000000-0000-4000-8000-000000000004', 'ec000000-0000-4000-8000-000000000001', 'ed000000-0000-4000-8000-000000000001',
   'is-guide', 'IS guide', 'culture', 480, 200000, 'published', 'guide', 'per_group_day', 1, 8, null),
  ('ee000000-0000-4000-8000-000000000005', 'ec000000-0000-4000-8000-000000000001', 'ed000000-0000-4000-8000-000000000001',
   'is-draft', 'IS draft', 'culture', 120, 100000, 'draft', 'experience', 'per_person', null, null, null);
-- Experiences are booked on published dates (instant booking).
insert into public.availability_slots (experience_id, starts_on, capacity) values ('ee000000-0000-4000-8000-000000000001', private.today_ist() + 30, 10), ('ee000000-0000-4000-8000-000000000001', private.today_ist() + 40, 10);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}', true);

-- Saving plans with stays and transport ------------------------------------------------------
-- 3 travellers -> 2 rooms; day 1-2 Ziro (walk + room each night), day 3 drive to Tawang.
select results_eq(
  $$ select estimated_total_minor, unpriced_item_count from public.save_itinerary_version(
       public.begin_itinerary_generation(null, 100), null, 'Ziro and Tawang', 'generate',
       jsonb_build_object('startDate', (private.today_ist() + 30)::text, 'adults', 3, 'children', 0), '{"days":[{},{},{}]}',
       'itinerary.v2', 'itinerary-v3', 'mock', 3, '[]',
       '[{"day_number":1,"position":1,"item_kind":"activity","units":1,"experience_id":"ee000000-0000-4000-8000-000000000001","destination_id":"ed000000-0000-4000-8000-000000000001","time_of_day":"morning","rationale":""},
         {"day_number":1,"position":7,"item_kind":"stay","units":2,"experience_id":"ee000000-0000-4000-8000-000000000002","destination_id":"ed000000-0000-4000-8000-000000000001","time_of_day":"evening","rationale":""},
         {"day_number":2,"position":7,"item_kind":"stay","units":2,"experience_id":"ee000000-0000-4000-8000-000000000002","destination_id":"ed000000-0000-4000-8000-000000000001","time_of_day":"evening","rationale":""},
         {"day_number":3,"position":8,"item_kind":"transport","units":1,"experience_id":"ee000000-0000-4000-8000-000000000003","destination_id":"ed000000-0000-4000-8000-000000000002","time_of_day":"morning","rationale":""}]') $$,
  -- walk 1000 x 3 + room 3000 x 2 rooms x 2 nights + SUV 9000 x 1
  $$ values (300000::bigint + 1200000 + 900000, 0) $$,
  'a plan with an activity, two stay nights and a transport leg is priced by unit');

reset role;
select results_eq(
  $$ select item_kind::text, units from public.itinerary_items it
     join public.itinerary_versions v on v.id = it.version_id
     join public.itineraries i on i.id = v.itinerary_id and i.title = 'Ziro and Tawang'
     order by it.day_number, it.position $$,
  $$ values ('activity'::text, 1), ('stay', 2), ('stay', 2), ('transport', 1) $$,
  'items keep their kind and quantity');
set local role authenticated;

create temp table plan_attempts (label text, items jsonb, travelers integer default 1) on commit drop;
grant all on plan_attempts to authenticated;
reset role;
insert into plan_attempts values
  ('stay as an activity', '[{"day_number":1,"position":1,"item_kind":"activity","experience_id":"ee000000-0000-4000-8000-000000000002","destination_id":"ed000000-0000-4000-8000-000000000001","time_of_day":"morning"}]'),
  ('guide as an activity', '[{"day_number":1,"position":1,"item_kind":"activity","experience_id":"ee000000-0000-4000-8000-000000000004","destination_id":"ed000000-0000-4000-8000-000000000001","time_of_day":"morning"}]'),
  ('stay elsewhere', '[{"day_number":1,"position":7,"item_kind":"stay","units":1,"experience_id":"ee000000-0000-4000-8000-000000000002","destination_id":"ed000000-0000-4000-8000-000000000002","time_of_day":"evening"}]'),
  ('too many rooms', '[{"day_number":1,"position":7,"item_kind":"stay","units":4,"experience_id":"ee000000-0000-4000-8000-000000000002","destination_id":"ed000000-0000-4000-8000-000000000001","time_of_day":"evening"}]'),
  ('route to the wrong place', '[{"day_number":1,"position":8,"item_kind":"transport","units":1,"experience_id":"ee000000-0000-4000-8000-000000000003","destination_id":"ed000000-0000-4000-8000-000000000001","time_of_day":"morning"}]'),
  ('draft experience', '[{"day_number":1,"position":1,"item_kind":"activity","experience_id":"ee000000-0000-4000-8000-000000000005","destination_id":"ed000000-0000-4000-8000-000000000001","time_of_day":"morning"}]');
insert into plan_attempts values
  ('too few rooms for the party', '[{"day_number":1,"position":7,"item_kind":"stay","units":2,"experience_id":"ee000000-0000-4000-8000-000000000002","destination_id":"ed000000-0000-4000-8000-000000000001","time_of_day":"evening"}]', 5);
set local role authenticated;
select throws_ok(
  format($$ select * from public.save_itinerary_version(public.begin_itinerary_generation(null, 100), null, 'Bad', 'generate',
       jsonb_build_object('startDate', (private.today_ist() + 30)::text, 'adults', %s, 'children', 0), '{"days":[{},{}]}',
       'itinerary.v2', 'itinerary-v3', 'mock', %s, '[]', %L::jsonb) $$, travelers, travelers, items),
  '55000', null, 'refused: ' || label)
from plan_attempts;

select throws_ok(
  $$ select * from public.save_itinerary_version(public.begin_itinerary_generation(null, 100), null, 'Two stays', 'generate',
       jsonb_build_object('startDate', (private.today_ist() + 30)::text, 'adults', 1, 'children', 0), '{"days":[{},{}]}',
       'itinerary.v2', 'itinerary-v3', 'mock', 1, '[]',
       '[{"day_number":1,"position":6,"item_kind":"stay","units":1,"experience_id":"ee000000-0000-4000-8000-000000000002","destination_id":"ed000000-0000-4000-8000-000000000001","time_of_day":"evening"},
         {"day_number":1,"position":7,"item_kind":"stay","units":1,"experience_id":"ee000000-0000-4000-8000-000000000002","destination_id":"ed000000-0000-4000-8000-000000000001","time_of_day":"evening"}]') $$,
  '22023', null, 'at most one stay per night');

select throws_ok(
  $$ select * from public.save_itinerary_version(public.begin_itinerary_generation(null, 100), null, 'Late stay', 'generate',
       jsonb_build_object('startDate', (private.today_ist() + 30)::text, 'adults', 1, 'children', 0), '{"days":[{},{}]}',
       'itinerary.v2', 'itinerary-v3', 'mock', 1, '[]',
       '[{"day_number":2,"position":7,"item_kind":"stay","units":1,"experience_id":"ee000000-0000-4000-8000-000000000002","destination_id":"ed000000-0000-4000-8000-000000000001","time_of_day":"evening"}]') $$,
  '22023', 'no stay after the last night of the trip', 'no stay on the last day of the trip');

-- Whole-trip booking groups consecutive nights -------------------------------------------------
select results_eq(
  $$ select count(distinct booking_id), count(*) filter (where error_code is null)
     from public.request_itinerary_bookings(
       (select v.id from public.itinerary_versions v join public.itineraries i on i.id = v.itinerary_id where i.title = 'Ziro and Tawang'),
       '+91 98765 43210', 'Trip', 'f9000000-0000-4000-8000-000000000001') $$,
  $$ values (3::bigint, 4::bigint) $$,
  '4 items become 3 requests: the walk, one 2-night stay, one transport leg');
reset role;
select results_eq(
  $$ select e.listing_type::text, b.ends_on - b.slot_starts_on, b.units, b.adults
     from public.bookings b join public.experiences e on e.id = b.experience_id
     where b.traveler_note = 'Trip' order by b.slot_starts_on, e.listing_type $$,
  $$ values ('experience'::text, null::integer, 1, 3), ('stay', 1, 2, 3), ('transport', 0, 1, 3) $$,
  'the stay covers both nights with 2 rooms; transport is a one-day trip');
set local role authenticated;
select results_eq(
  $$ select count(*) filter (where error_code is null), bool_and(replayed) from public.request_itinerary_bookings(
       (select v.id from public.itinerary_versions v join public.itineraries i on i.id = v.itinerary_id where i.title = 'Ziro and Tawang'),
       '+91 98765 43210', 'Trip', 'f9000000-0000-4000-8000-000000000001') $$,
  $$ values (4::bigint, true) $$, 'a retry replays every group');
select results_eq(
  $$ select count(*) filter (where error_code = '22023'), count(*) from public.request_itinerary_bookings(
       (select v.id from public.itinerary_versions v join public.itineraries i on i.id = v.itinerary_id where i.title = 'Ziro and Tawang'),
       '+91 90000 00000', 'Trip', 'f9000000-0000-4000-8000-000000000001') $$,
  $$ values (4::bigint, 4::bigint) $$, 'reusing the key with different details is refused for every group');
reset role;
select is((select count(*) from public.bookings where traveler_note = 'Trip'), 3::bigint,
  'retries created no extra bookings');
set local role authenticated;

-- 3a review gaps ------------------------------------------------------------------------------------
select lives_ok(
  $$ select * from public.request_listing_booking('ee000000-0000-4000-8000-000000000001', private.today_ist() + 40, null,
       1, 2, 0, '+91 98765 43210', '', '', gen_random_uuid()) $$,
  'experiences can also be requested through request_listing_booking');
select throws_ok(
  $$ select * from public.request_listing_booking('ee000000-0000-4000-8000-000000000005', private.today_ist() + 40, private.today_ist() + 41,
       1, 2, 0, '+91 98765 43210', '', '', gen_random_uuid()) $$,
  'P0002', 'this date is not available for booking', 'a draft experience gets the same answer as an unknown id (no oracle)');
select throws_ok(
  $$ select * from public.request_listing_booking('ee000000-0000-4000-8000-000000000004', private.today_ist() + 40, private.today_ist() + 54,
       1, 2, 0, '+91 98765 43210', '', '', gen_random_uuid()) $$,
  '22023', null, 'guides are at most 14 days per request');
select throws_ok(
  $$ update public.experiences set listing_type = 'stay' where id = 'ee000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'a listing''s type cannot be changed');

select set_config('request.jwt.claims', '{"sub":"e3333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal2"}', true);
select throws_ok(
  $$ select * from public.request_listing_booking('ee000000-0000-4000-8000-000000000004', private.today_ist() + 40, private.today_ist() + 40,
       1, 2, 0, '+91 98765 43210', '', '', gen_random_uuid()) $$,
  '42501', null, 'partners cannot book (their own listings included)');
-- The transport leg was confirmed instantly; the partner cancels it and capacity frees up.
select is(
  (select b.status::text from public.bookings b join public.experiences e on e.id = b.experience_id
   where b.traveler_note = 'Trip' and e.listing_type = 'transport'), 'confirmed',
  'the transport leg was confirmed instantly');
select throws_ok(
  $$ select public.respond_to_booking((select b.id from public.bookings b join public.experiences e on e.id = b.experience_id
       where b.traveler_note = 'Trip' and e.listing_type = 'stay'), 'confirmed', 1200000, null) $$,
  '55000', null, 'an instantly confirmed stay needs no partner response');
select lives_ok(
  $$ select public.cancel_booking((select b.id from public.bookings b join public.experiences e on e.id = b.experience_id
       where b.traveler_note = 'Trip' and e.listing_type = 'transport'), 'Vehicle broke down') $$,
  'the partner cancels the confirmed leg');
reset role;
select is(
  private.listing_units_booked('ee000000-0000-4000-8000-000000000003', private.today_ist() + 32), 0,
  'cancelling frees the capacity');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$ select * from public.request_listing_booking('ee000000-0000-4000-8000-000000000004', private.today_ist() + 40, private.today_ist() + 40,
       1, 2, 0, '+91 98765 43210', '', '', gen_random_uuid()) $$,
  '42501', null, 'anon cannot request');

select * from finish();
rollback;
