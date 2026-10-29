-- Guides in AI itineraries (migrations itinerary_guide_kind, itinerary_guides):
-- a guide day is checked against the day's base, capacity and party, priced by
-- its own unit, and consecutive days with one guide become one booking.
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('9a111111-1111-4111-8111-111111111111', 'ig.traveller@example.test', 'authenticated', 'authenticated', '{"account_type":"traveller"}');
insert into public.providers (id, slug, display_name, status, verified_at)
values ('9a000000-0000-4000-8000-000000000001', 'ig-provider', 'IG Provider', 'verified', now());
insert into public.destinations (id, slug, name, district, is_published) values
  ('9ad00000-0000-4000-8000-000000000001', 'ig-ziro', 'IG Ziro', 'Lower Subansiri', true),
  ('9ad00000-0000-4000-8000-000000000002', 'ig-tawang', 'IG Tawang', 'Tawang', true);
-- walk; guide per group per day (2 guides, 4 people each); guide per person per day; a guide in Tawang;
-- a guide whose partner switched bookings off.
insert into public.experiences (id, provider_id, destination_id, slug, title, category, duration_minutes, price_from_minor, status,
  listing_type, price_unit, daily_capacity, max_guests, languages, accepts_bookings) values
  ('9ae00000-0000-4000-8000-000000000001', '9a000000-0000-4000-8000-000000000001', '9ad00000-0000-4000-8000-000000000001',
   'ig-walk', 'IG walk', 'culture', 120, 100000, 'published', 'experience', 'per_person', null, null, '{}', true),
  ('9ae00000-0000-4000-8000-000000000002', '9a000000-0000-4000-8000-000000000001', '9ad00000-0000-4000-8000-000000000001',
   'ig-group-guide', 'IG group guide', 'culture', 480, 250000, 'published', 'guide', 'per_group_day', 2, 4, '{English,Apatani}', true),
  ('9ae00000-0000-4000-8000-000000000003', '9a000000-0000-4000-8000-000000000001', '9ad00000-0000-4000-8000-000000000001',
   'ig-person-guide', 'IG person guide', 'culture', 480, 80000, 'published', 'guide', 'per_person_day', 1, 8, '{Hindi}', true),
  ('9ae00000-0000-4000-8000-000000000004', '9a000000-0000-4000-8000-000000000001', '9ad00000-0000-4000-8000-000000000002',
   'ig-tawang-guide', 'IG Tawang guide', 'culture', 480, 300000, 'published', 'guide', 'per_group_day', 1, 6, '{}', true),
  ('9ae00000-0000-4000-8000-000000000005', '9a000000-0000-4000-8000-000000000001', '9ad00000-0000-4000-8000-000000000001',
   'ig-closed-guide', 'IG closed guide', 'culture', 480, 100000, 'published', 'guide', 'per_group_day', 3, 6, '{}', false);
-- Experiences are booked on published dates (instant booking).
insert into public.availability_slots (experience_id, starts_on, capacity) values ('9ae00000-0000-4000-8000-000000000001', private.today_ist() + 30, 10);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"9a111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}', true);

-- 3 travellers, 3 days in Ziro, the walk on day 1 and the group guide every day (1 guide).
select results_eq(
  $$ select estimated_total_minor from public.save_itinerary_version(
       public.begin_itinerary_generation(null, 100), null, 'Ziro with a guide', 'generate',
       jsonb_build_object('startDate', (private.today_ist() + 30)::text, 'adults', 3, 'children', 0), '{"days":[{},{},{}]}',
       'itinerary.v3', 'itinerary-v4', 'mock', 3, '[]',
       '[{"day_number":1,"position":1,"item_kind":"activity","units":1,"experience_id":"9ae00000-0000-4000-8000-000000000001","destination_id":"9ad00000-0000-4000-8000-000000000001","time_of_day":"morning","rationale":""},
         {"day_number":1,"position":9,"item_kind":"guide","units":1,"experience_id":"9ae00000-0000-4000-8000-000000000002","destination_id":"9ad00000-0000-4000-8000-000000000001","time_of_day":"full_day","rationale":""},
         {"day_number":2,"position":9,"item_kind":"guide","units":1,"experience_id":"9ae00000-0000-4000-8000-000000000002","destination_id":"9ad00000-0000-4000-8000-000000000001","time_of_day":"full_day","rationale":""},
         {"day_number":3,"position":9,"item_kind":"guide","units":1,"experience_id":"9ae00000-0000-4000-8000-000000000002","destination_id":"9ad00000-0000-4000-8000-000000000001","time_of_day":"full_day","rationale":""}]') $$,
  -- walk 1000 x 3 + group guide 2500 x 1 guide x 3 days
  $$ values (300000::bigint + 750000) $$,
  'a per-group guide is priced per guide per day');

select results_eq(
  $$ select estimated_total_minor from public.save_itinerary_version(
       public.begin_itinerary_generation(null, 100), null, 'Ziro per person', 'generate',
       jsonb_build_object('startDate', (private.today_ist() + 30)::text, 'adults', 3, 'children', 0), '{"days":[{}]}',
       'itinerary.v3', 'itinerary-v4', 'mock', 3, '[]',
       '[{"day_number":1,"position":9,"item_kind":"guide","units":1,"experience_id":"9ae00000-0000-4000-8000-000000000003","destination_id":"9ad00000-0000-4000-8000-000000000001","time_of_day":"full_day","rationale":""}]') $$,
  $$ values (240000::bigint) $$,
  'a per-person guide is priced per traveller per day');

reset role;
select results_eq(
  $$ select it.item_kind::text, count(*) from public.itinerary_items it
     join public.itinerary_versions v on v.id = it.version_id
     join public.itineraries i on i.id = v.itinerary_id and i.title = 'Ziro with a guide'
     group by 1 order by 1 $$,
  $$ values ('activity'::text, 1::bigint), ('guide', 3) $$,
  'guide days are stored as their own kind');
set local role authenticated;

create temp table guide_attempts (label text, travelers integer, items jsonb) on commit drop;
grant all on guide_attempts to authenticated;
reset role;
insert into guide_attempts values
  ('a guide at another destination', 1, '[{"day_number":1,"position":9,"item_kind":"guide","units":1,"experience_id":"9ae00000-0000-4000-8000-000000000004","destination_id":"9ad00000-0000-4000-8000-000000000001","time_of_day":"full_day"}]'),
  ('too few guides for the party', 5, '[{"day_number":1,"position":9,"item_kind":"guide","units":1,"experience_id":"9ae00000-0000-4000-8000-000000000002","destination_id":"9ad00000-0000-4000-8000-000000000001","time_of_day":"full_day"}]'),
  ('more guides than listed', 1, '[{"day_number":1,"position":9,"item_kind":"guide","units":3,"experience_id":"9ae00000-0000-4000-8000-000000000002","destination_id":"9ad00000-0000-4000-8000-000000000001","time_of_day":"full_day"}]'),
  ('a guide whose partner switched bookings off', 1, '[{"day_number":1,"position":9,"item_kind":"guide","units":1,"experience_id":"9ae00000-0000-4000-8000-000000000005","destination_id":"9ad00000-0000-4000-8000-000000000001","time_of_day":"full_day"}]'),
  ('a guide passed off as an activity', 1, '[{"day_number":1,"position":1,"item_kind":"activity","units":1,"experience_id":"9ae00000-0000-4000-8000-000000000002","destination_id":"9ad00000-0000-4000-8000-000000000001","time_of_day":"morning"}]');
set local role authenticated;
select throws_ok(
  format($$ select * from public.save_itinerary_version(public.begin_itinerary_generation(null, 100), null, 'Bad guide', 'generate',
       jsonb_build_object('startDate', (private.today_ist() + 30)::text, 'adults', %s, 'children', 0), '{"days":[{}]}',
       'itinerary.v3', 'itinerary-v4', 'mock', %s, '[]', %L::jsonb) $$, travelers, travelers, items),
  '55000', null, 'refused: ' || label)
from guide_attempts;

select throws_ok(
  $$ select * from public.save_itinerary_version(public.begin_itinerary_generation(null, 100), null, 'Two guides', 'generate',
       jsonb_build_object('startDate', (private.today_ist() + 30)::text, 'adults', 1, 'children', 0), '{"days":[{}]}',
       'itinerary.v3', 'itinerary-v4', 'mock', 1, '[]',
       '[{"day_number":1,"position":9,"item_kind":"guide","units":1,"experience_id":"9ae00000-0000-4000-8000-000000000002","destination_id":"9ad00000-0000-4000-8000-000000000001","time_of_day":"full_day"},
         {"day_number":1,"position":10,"item_kind":"guide","units":1,"experience_id":"9ae00000-0000-4000-8000-000000000003","destination_id":"9ad00000-0000-4000-8000-000000000001","time_of_day":"full_day"}]') $$,
  '22023', null, 'at most one guide per day');

-- Whole-trip booking: three guide days become one booking -----------------------------------
select results_eq(
  $$ select count(distinct booking_id), count(*) filter (where error_code is null)
     from public.request_itinerary_bookings(
       (select v.id from public.itinerary_versions v join public.itineraries i on i.id = v.itinerary_id where i.title = 'Ziro with a guide'),
       '+91 98765 43210', 'Trip', '9af00000-0000-4000-8000-000000000001') $$,
  $$ values (2::bigint, 4::bigint) $$,
  '4 items become 2 requests: the walk and one 3-day guide booking');
reset role;
select results_eq(
  $$ select b.ends_on - b.slot_starts_on, b.units, b.adults from public.bookings b
     where b.traveler_note = 'Trip' and b.experience_id = '9ae00000-0000-4000-8000-000000000002' $$,
  $$ values (2, 1, 3) $$, 'the guide booking covers all three days for the party');
set local role authenticated;
select results_eq(
  $$ select count(*) filter (where error_code is null), bool_and(replayed) from public.request_itinerary_bookings(
       (select v.id from public.itinerary_versions v join public.itineraries i on i.id = v.itinerary_id where i.title = 'Ziro with a guide'),
       '+91 98765 43210', 'Trip', '9af00000-0000-4000-8000-000000000001') $$,
  $$ values (4::bigint, true) $$, 'a retry replays both requests');

-- Grouping edge cases: same guide on days 1 and 3 with another on day 2 (no merge across
-- the gap), and a change in the number of guides (no merge either). 5 travellers on day 1-2
-- need 2 group guides; on day 3 one per-person guide, then the group guide again on day 4.
select lives_ok(
  $$ select * from public.save_itinerary_version(public.begin_itinerary_generation(null, 100), null, 'Guide gaps', 'generate',
       jsonb_build_object('startDate', (private.today_ist() + 50)::text, 'adults', 5, 'children', 0), '{"days":[{},{},{},{}]}',
       'itinerary.v3', 'itinerary-v4', 'mock', 5, '[]',
       '[{"day_number":1,"position":9,"item_kind":"guide","units":2,"experience_id":"9ae00000-0000-4000-8000-000000000002","destination_id":"9ad00000-0000-4000-8000-000000000001","time_of_day":"full_day"},
         {"day_number":2,"position":9,"item_kind":"guide","units":2,"experience_id":"9ae00000-0000-4000-8000-000000000002","destination_id":"9ad00000-0000-4000-8000-000000000001","time_of_day":"full_day"},
         {"day_number":3,"position":9,"item_kind":"guide","units":1,"experience_id":"9ae00000-0000-4000-8000-000000000003","destination_id":"9ad00000-0000-4000-8000-000000000001","time_of_day":"full_day"},
         {"day_number":4,"position":9,"item_kind":"guide","units":2,"experience_id":"9ae00000-0000-4000-8000-000000000002","destination_id":"9ad00000-0000-4000-8000-000000000001","time_of_day":"full_day"}]') $$,
  'a plan with guide gaps saves');
reset role;
select is((select v.estimated_total_minor from public.itinerary_versions v join public.itineraries i on i.id = v.itinerary_id
           where i.title = 'Guide gaps'),
  -- group guide 2500 x 2 guides x 3 days + per-person guide 800 x 5 travellers
  1500000::bigint + 400000, 'a per-group guide multiplies by the number of guides');
set local role authenticated;
select results_eq(
  $$ select count(distinct booking_id) from public.request_itinerary_bookings(
       (select v.id from public.itinerary_versions v join public.itineraries i on i.id = v.itinerary_id where i.title = 'Guide gaps'),
       '+91 98765 43210', 'Gaps', '9af00000-0000-4000-8000-000000000002') $$,
  $$ values (3::bigint) $$, 'days 1-2, day 3 and day 4 are three separate guide bookings');

select throws_ok(
  $$ select * from public.save_itinerary_version(public.begin_itinerary_generation(null, 100), null, 'Room as guide', 'generate',
       jsonb_build_object('startDate', (private.today_ist() + 30)::text, 'adults', 1, 'children', 0), '{"days":[{},{}]}',
       'itinerary.v3', 'itinerary-v4', 'mock', 1, '[]',
       '[{"day_number":1,"position":9,"item_kind":"guide","units":1,"experience_id":"9ae00000-0000-4000-8000-000000000001","destination_id":"9ad00000-0000-4000-8000-000000000001","time_of_day":"full_day"}]') $$,
  '55000', null, 'another listing type passed off as a guide is refused');

reset role;
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('9a222222-2222-4222-8222-222222222222', 'ig.other@example.test', 'authenticated', 'authenticated', '{"account_type":"traveller"}');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"9a222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal1"}', true);
select throws_ok(
  $$ select * from public.request_itinerary_bookings(
       (select v.id from public.itinerary_versions v join public.itineraries i on i.id = v.itinerary_id where i.title = 'Guide gaps'),
       '+91 98765 43210', 'Not mine', gen_random_uuid()) $$,
  'P0002', null, 'another traveller cannot book someone else''s plan');

select * from finish();
rollback;
