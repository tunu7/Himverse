-- Listing types (migration listing_types, ADR-0008): per-type shape, date-range
-- requests with units, database estimates, and capacity enforced on confirmation.
begin;
create extension if not exists pgtap with schema extensions;

select plan(24);

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('d1111111-1111-4111-8111-111111111111', 'lt.traveller@example.test', 'authenticated', 'authenticated', '{"account_type":"traveller"}'),
  ('d2222222-2222-4222-8222-222222222222', 'lt.traveller2@example.test', 'authenticated', 'authenticated', '{"account_type":"traveller"}'),
  ('d3333333-3333-4333-8333-333333333333', 'lt.partner@example.test', 'authenticated', 'authenticated', '{"account_type":"partner"}');
insert into public.providers (id, slug, display_name, status, verified_at)
values ('dc000000-0000-4000-8000-000000000001', 'lt-provider', 'LT Provider', 'verified', now());
insert into public.provider_members (provider_id, user_id)
values ('dc000000-0000-4000-8000-000000000001', 'd3333333-3333-4333-8333-333333333333');
insert into public.destinations (id, slug, name, district, is_published) values
  ('dd000000-0000-4000-8000-000000000001', 'lt-ziro', 'LT Ziro', 'Lower Subansiri', true),
  ('dd000000-0000-4000-8000-000000000002', 'lt-tawang', 'LT Tawang', 'Tawang', true);

-- Shape rules ----------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.experiences (provider_id, destination_id, slug, title, category, duration_minutes, status, listing_type, price_unit)
     values ('dc000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000001', 'lt-bad-stay', 'Bad stay', 'nature', 1440, 'published', 'stay', 'per_room_night') $$,
  '23514', null, 'a stay needs rooms and guests per room');
select throws_ok(
  $$ insert into public.experiences (provider_id, destination_id, slug, title, category, duration_minutes, status, listing_type, price_unit, daily_capacity, max_guests)
     values ('dc000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000001', 'lt-bad-unit', 'Bad unit', 'nature', 1440, 'published', 'stay', 'per_person', 2, 2) $$,
  '23514', null, 'a stay is priced per room per night');
select throws_ok(
  $$ insert into public.experiences (provider_id, destination_id, slug, title, category, duration_minutes, status, route_to_destination_id)
     values ('dc000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000001', 'lt-bad-route', 'Bad route', 'nature', 60, 'published', 'dd000000-0000-4000-8000-000000000002') $$,
  '23514', null, 'only transport has a route');

insert into public.experiences (id, provider_id, destination_id, slug, title, category, duration_minutes, price_from_minor, status,
  listing_type, price_unit, daily_capacity, max_guests, languages, route_to_destination_id) values
  ('de000000-0000-4000-8000-000000000001', 'dc000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000001',
   'lt-room', 'Family room', 'culture', 1440, 300000, 'published', 'stay', 'per_room_night', 2, 3, '{}', null),
  ('de000000-0000-4000-8000-000000000002', 'dc000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000001',
   'lt-guide', 'Ziro guide', 'culture', 480, 200000, 'published', 'guide', 'per_group_day', 1, 8, '{English,Hindi,Apatani}', null),
  ('de000000-0000-4000-8000-000000000003', 'dc000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000001',
   'lt-taxi', 'Ziro to Tawang SUV', 'adventure', 600, 900000, 'published', 'transport', 'per_vehicle_trip', 1, 6, '{}', 'dd000000-0000-4000-8000-000000000002'),
  ('de000000-0000-4000-8000-000000000004', 'dc000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000001',
   'lt-walker', 'Walking guide', 'culture', 480, 50000, 'published', 'guide', 'per_person_day', 1, 10, '{English}', null);

select throws_ok(
  $$ insert into public.availability_slots (experience_id, starts_on, capacity) values ('de000000-0000-4000-8000-000000000001', private.today_ist() + 5, 2) $$,
  '22023', null, 'dated seat slots are only for experiences');

-- Requests ---------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

select lives_ok(
  $$ select * from public.request_listing_booking('de000000-0000-4000-8000-000000000001', private.today_ist() + 10, private.today_ist() + 11,
       1, 2, 1, '+91 98765 43210', '', '', 'f1000000-0000-4000-8000-000000000001') $$,
  'a traveller requests 2 nights in 1 room for 3 guests');
reset role;
select results_eq(
  $$ select slot_starts_on - private.today_ist(), ends_on - private.today_ist(), units, estimated_total_minor
     from public.bookings where idempotency_key = 'f1000000-0000-4000-8000-000000000001' $$,
  $$ values (10, 11, 1, 600000::bigint) $$,
  'stay estimate = price x rooms x nights, dates and rooms stored');
set local role authenticated;
select results_eq(
  $$ select replayed from public.request_listing_booking('de000000-0000-4000-8000-000000000001', private.today_ist() + 10, private.today_ist() + 11,
       1, 2, 1, '+91 98765 43210', '', '', 'f1000000-0000-4000-8000-000000000001') $$,
  $$ values (true) $$, 'retries replay');
select throws_ok(
  $$ select * from public.request_listing_booking('de000000-0000-4000-8000-000000000001', private.today_ist() + 10, private.today_ist() + 12,
       1, 2, 1, '+91 98765 43210', '', '', 'f1000000-0000-4000-8000-000000000001') $$,
  '22023', null, 'the same key with other dates is refused');
select throws_ok(
  $$ select * from public.request_listing_booking('de000000-0000-4000-8000-000000000001', private.today_ist() + 20, private.today_ist() + 20,
       1, 4, 0, '+91 98765 43210', '', '', gen_random_uuid()) $$,
  '22023', null, 'too many guests for one room');
select throws_ok(
  $$ select * from public.request_listing_booking('de000000-0000-4000-8000-000000000001', private.today_ist() + 20, private.today_ist() + 20,
       3, 2, 0, '+91 98765 43210', '', '', gen_random_uuid()) $$,
  '22023', null, 'more rooms than the room type has');
select throws_ok(
  $$ select * from public.request_listing_booking('de000000-0000-4000-8000-000000000001', private.today_ist() + 20, private.today_ist() + 19,
       1, 2, 0, '+91 98765 43210', '', '', gen_random_uuid()) $$,
  '22023', null, 'the end must not be before the start');
select throws_ok(
  $$ select * from public.request_listing_booking('de000000-0000-4000-8000-000000000001', private.today_ist() + 20, private.today_ist() + 60,
       1, 2, 0, '+91 98765 43210', '', '', gen_random_uuid()) $$,
  '22023', null, 'stays are at most 30 nights');
select throws_ok(
  $$ select * from public.request_listing_booking('de000000-0000-4000-8000-000000000003', private.today_ist() + 20, private.today_ist() + 21,
       1, 2, 0, '+91 98765 43210', '', '', gen_random_uuid()) $$,
  '22023', null, 'a one-way trip is one date');
select throws_ok(
  $$ select * from public.request_booking_on_date('de000000-0000-4000-8000-000000000001', private.today_ist() + 20, 1, 0, '+91 98765 43210', '', gen_random_uuid()) $$,
  '22023', null, 'non-experience listings cannot be booked as a single-date experience');

select lives_ok(
  $$ select * from public.request_listing_booking('de000000-0000-4000-8000-000000000002', private.today_ist() + 10, private.today_ist() + 12,
       1, 4, 0, '+91 98765 43210', '', '', 'f1000000-0000-4000-8000-000000000002') $$,
  'a 3-day guide request');
select lives_ok(
  $$ select * from public.request_listing_booking('de000000-0000-4000-8000-000000000004', private.today_ist() + 10, private.today_ist() + 11,
       1, 3, 0, '+91 98765 43210', '', '', 'f1000000-0000-4000-8000-000000000004') $$,
  'a 2-day per-person guide request');
select lives_ok(
  $$ select * from public.request_listing_booking('de000000-0000-4000-8000-000000000003', private.today_ist() + 12, private.today_ist() + 12,
       1, 4, 0, '+91 98765 43210', '', 'Hotel Blue Pine, 8am', 'f1000000-0000-4000-8000-000000000003') $$,
  'a one-way transport request with a pickup note');
reset role;
select results_eq(
  $$ select idempotency_key::text, estimated_total_minor from public.bookings
     where idempotency_key in ('f1000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000004')
     order by idempotency_key $$,
  $$ values ('f1000000-0000-4000-8000-000000000002', 600000::bigint),
            ('f1000000-0000-4000-8000-000000000003', 900000::bigint),
            ('f1000000-0000-4000-8000-000000000004', 300000::bigint) $$,
  'estimates: guide per group x days, vehicle per trip, per person x days');

-- Capacity on confirmation ----------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d2222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select lives_ok(
  $$ select * from public.request_listing_booking('de000000-0000-4000-8000-000000000002', private.today_ist() + 12, private.today_ist() + 12,
       1, 2, 0, '+91 91234 56789', '', '', 'f2000000-0000-4000-8000-000000000001') $$,
  'another traveller requests the guide on an overlapping day');

select set_config('request.jwt.claims', '{"sub":"d3333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal2"}', true);
select is(
  public.respond_to_booking((select id from public.bookings where idempotency_key = 'f1000000-0000-4000-8000-000000000002'), 'confirmed', 600000, null),
  'confirmed'::public.booking_status, 'the partner confirms the 3-day guide booking');
select throws_ok(
  $$ select public.respond_to_booking((select id from public.bookings where idempotency_key = 'f2000000-0000-4000-8000-000000000001'), 'confirmed', 200000, null) $$,
  '55000', null, 'the overlapping day is now fully booked: confirmation refused');
select set_config('request.jwt.claims', '{"sub":"d2222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.request_listing_booking('de000000-0000-4000-8000-000000000002', private.today_ist() + 11, private.today_ist() + 11,
       1, 2, 0, '+91 91234 56789', '', '', gen_random_uuid()) $$,
  '55000', null, 'new requests on a fully booked day are refused early');

-- Completion after the last day --------------------------------------------------------------
reset role;
update public.bookings set slot_starts_on = private.today_ist() - 3, ends_on = private.today_ist()
where idempotency_key = 'f1000000-0000-4000-8000-000000000002';
select results_eq($$ select completed_count from private.sweep_bookings() $$, $$ values (0) $$,
  'a booking whose last day is today is not completed yet');
update public.bookings set ends_on = private.today_ist() - 1
where idempotency_key = 'f1000000-0000-4000-8000-000000000002';
select results_eq($$ select completed_count from private.sweep_bookings() $$, $$ values (1) $$,
  'it completes after its last day');

select * from finish();
rollback;
