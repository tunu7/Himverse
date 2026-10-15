-- Booking lifecycle: transitions, authorization, provider isolation, idempotency,
-- seat limits, price snapshots, cancellation windows, expiry and history
-- (ADR-0004, migration 20261012180243_bookings). Concurrency is covered by
-- tests/integration/booking-concurrency.test.ts (parallel connections).
begin;
create extension if not exists pgtap with schema extensions;

select plan(59);

truncate public.booking_events, public.bookings, public.availability_slots, public.itinerary_items,
  public.experiences, public.destinations, public.provider_status_events,
  public.provider_private_details, public.provider_members, public.providers;

-- Fixtures ----------------------------------------------------------------------
-- T, T2: travelers   P: owner of verified provider Pv   Q: owner of verified Qv   A: admin
insert into auth.users (id, email, aud, role) values
  ('11111111-1111-4111-8111-111111111111', 'traveler.one@example.test', 'authenticated', 'authenticated'),
  ('22222222-2222-4222-8222-222222222222', 'traveler.two@example.test', 'authenticated', 'authenticated'),
  ('33333333-3333-4333-8333-333333333333', 'owner.p@example.test', 'authenticated', 'authenticated'),
  ('44444444-4444-4444-8444-444444444444', 'owner.q@example.test', 'authenticated', 'authenticated'),
  ('55555555-5555-4555-8555-555555555555', 'admin@example.test', 'authenticated', 'authenticated');
insert into public.user_roles (user_id, role) values ('55555555-5555-4555-8555-555555555555', 'admin');
insert into public.providers (id, slug, display_name, status, verified_at) values
  ('a0000000-0000-4000-8000-000000000001', 'pv-provider', 'Pv', 'verified', now()),
  ('a0000000-0000-4000-8000-000000000002', 'qv-provider', 'Qv', 'verified', now()),
  ('a0000000-0000-4000-8000-000000000003', 'sv-provider', 'Sv', 'suspended', now());
insert into public.provider_members (provider_id, user_id) values
  ('a0000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333'),
  ('a0000000-0000-4000-8000-000000000002', '44444444-4444-4444-8444-444444444444');
insert into public.destinations (id, slug, name, district, is_published) values
  ('d0000000-0000-4000-8000-000000000001', 'ziro', 'Ziro Valley', 'Lower Subansiri', true),
  ('d0000000-0000-4000-8000-000000000002', 'hidden', 'Hidden', 'Shi Yomi', false);
insert into public.experiences (id, provider_id, destination_id, slug, title, category, duration_minutes, price_from_minor, status) values
  ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'x1-walk', 'X1 walk', 'culture', 120, 100000, 'published'),
  ('e0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002', 'x2-hidden', 'X2 hidden', 'nature', 120, 50000, 'published'),
  ('e0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001', 'x3-suspended', 'X3 suspended', 'nature', 120, 50000, 'published'),
  ('e0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'x4-q', 'X4 by Q', 'nature', 120, 70000, 'published');
-- S1 future cap 3 | S2 past | S3 closed | S4 draft destination | S5 suspended provider
-- S6 Q's experience | S7 starts in about 6 hours
insert into public.availability_slots (id, experience_id, starts_on, start_time, capacity, status) values
  ('50000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', private.today_ist() + 10, null, 3, 'open'),
  ('50000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', private.today_ist() - 1, null, 3, 'open'),
  ('50000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000001', private.today_ist() + 11, null, 3, 'closed'),
  ('50000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000002', private.today_ist() + 10, null, 3, 'open'),
  ('50000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-000000000003', private.today_ist() + 10, null, 3, 'open'),
  ('50000000-0000-4000-8000-000000000006', 'e0000000-0000-4000-8000-000000000004', private.today_ist() + 10, null, 5, 'open'),
  ('50000000-0000-4000-8000-000000000007', 'e0000000-0000-4000-8000-000000000001',
     ((now() + interval '6 hours') at time zone 'Asia/Kolkata')::date,
     ((now() + interval '6 hours') at time zone 'Asia/Kolkata')::time(0), 10, 'open');

-- Anonymous ---------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select results_eq(
  $$ select id from public.availability_slots order by id $$,
  $$ values ('50000000-0000-4000-8000-000000000001'::uuid), ('50000000-0000-4000-8000-000000000006'::uuid), ('50000000-0000-4000-8000-000000000007'::uuid) $$,
  'anon sees only open, upcoming slots of public experiences');
select throws_ok($$ select * from public.request_booking('50000000-0000-4000-8000-000000000001', 1, 0, '+91 98765 43210', '', gen_random_uuid()) $$,
  '42501', null, 'anon cannot request bookings');
select throws_ok($$ select id from public.bookings $$, '42501', null, 'anon cannot read bookings');

-- Traveler T requests ------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}', true);

select results_eq(
  $$ select booking_status, replayed from public.request_booking('50000000-0000-4000-8000-000000000001', 2, 0, '+91 98765 43210', 'Vegetarian', 'f0000000-0000-4000-8000-000000000001') $$,
  $$ values ('requested'::public.booking_status, false) $$,
  'traveler requests a booking');
select results_eq(
  $$ select replayed from public.request_booking('50000000-0000-4000-8000-000000000001', 2, 0, '+91 98765 43210', 'Vegetarian', 'f0000000-0000-4000-8000-000000000001') $$,
  $$ values (true) $$,
  'retrying with the same idempotency key returns the original booking');
select is((select count(*) from public.bookings), 1::bigint, 'the retry created no duplicate');
select throws_ok(
  $$ select * from public.request_booking('50000000-0000-4000-8000-000000000001', 3, 0, '+91 98765 43210', '', 'f0000000-0000-4000-8000-000000000001') $$,
  '22023', null, 'reusing a key for a different request is rejected');
select throws_ok(
  $$ select * from public.request_booking('50000000-0000-4000-8000-000000000001', 1, 0, '+91 98765 43210', '', 'f0000000-0000-4000-8000-000000000099') $$,
  '23505', null, 'a second active booking for the same slot is rejected');

reset role;
select set_config('test.b1', (select id::text from public.bookings where idempotency_key = 'f0000000-0000-4000-8000-000000000001'), true);
select is(
  (select estimated_total_minor from public.bookings where id = current_setting('test.b1')::uuid),
  200000::bigint, 'estimate is snapshotted from the database price x party');
select ok(
  (select request_expires_at between now() + interval '47 hours 59 minutes' and now() + interval '48 hours'
   from public.bookings where id = current_setting('test.b1')::uuid),
  'request expires 48 hours after it is made');
select results_eq(
  $$ select from_status::text, to_status::text, actor_role::text from public.booking_events where booking_id = current_setting('test.b1')::uuid $$,
  $$ values (null::text, 'requested'::text, 'traveler'::text) $$,
  'the request is recorded in the history');
set local role authenticated;

-- Unavailable or invalid requests
select throws_ok($$ select * from public.request_booking('50000000-0000-4000-8000-000000000002', 1, 0, '+91 98765 43210', '', gen_random_uuid()) $$, 'P0002', null, 'past dates cannot be booked (reported as not available)');
select throws_ok($$ select * from public.request_booking('50000000-0000-4000-8000-000000000003', 1, 0, '+91 98765 43210', '', gen_random_uuid()) $$, 'P0002', null, 'closed slots cannot be booked (reported as not available)');
select throws_ok($$ select * from public.request_booking('50000000-0000-4000-8000-000000000004', 1, 0, '+91 98765 43210', '', gen_random_uuid()) $$, 'P0002', null, 'experiences at unpublished destinations cannot be booked (reported as not available)');
select throws_ok($$ select * from public.request_booking('50000000-0000-4000-8000-000000000005', 1, 0, '+91 98765 43210', '', gen_random_uuid()) $$, 'P0002', null, 'suspended providers'' experiences cannot be booked (reported as not available)');
select throws_ok($$ select * from public.request_booking('99999999-9999-4999-8999-999999999999', 1, 0, '+91 98765 43210', '', gen_random_uuid()) $$, 'P0002', null, 'unknown slots are not found');
select throws_ok($$ select * from public.request_booking('50000000-0000-4000-8000-000000000006', 6, 0, '+91 98765 43210', '', gen_random_uuid()) $$, '55000', null, 'parties larger than the remaining seats are refused');
select throws_ok($$ select * from public.request_booking('50000000-0000-4000-8000-000000000006', 1, 0, 'call me', '', gen_random_uuid()) $$, '22023', null, 'an invalid contact phone is refused');

-- No direct writes
select throws_ok($$ update public.bookings set status = 'confirmed' $$, '42501', null, 'travelers cannot change status directly');
select throws_ok($$ update public.bookings set estimated_total_minor = 1 $$, '42501', null, 'travelers cannot change prices');
select throws_ok(
  $$ insert into public.bookings (reference, traveler_id, traveler_name, provider_id, experience_id, slot_id, adults, contact_phone, request_expires_at, idempotency_key)
     values ('HV-AAAAAA', '11111111-1111-4111-8111-111111111111', 'x', 'a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 1, '+91 98765 43210', now(), gen_random_uuid()) $$,
  '42501', null, 'bookings cannot be inserted directly');
select throws_ok(
  $$ select public.respond_to_booking(current_setting('test.b1')::uuid, 'confirmed', 1, null) $$,
  'P0002', null, 'travelers cannot confirm their own booking');

-- Traveler T2 ----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal2"}', true);
select is_empty($$ select 1 from public.bookings $$, 'another traveler cannot see the booking');
select is_empty($$ select 1 from public.booking_events $$, 'another traveler cannot see its history');
select throws_ok($$ select public.cancel_booking(current_setting('test.b1')::uuid, null) $$, 'P0002', null, 'another traveler cannot cancel it');
select lives_ok(
  $$ select * from public.request_booking('50000000-0000-4000-8000-000000000001', 2, 0, '+91 91234 56789', '', 'f0000000-0000-4000-8000-000000000002') $$,
  'a second traveler requests the same date');
reset role;
select set_config('test.b2', (select id::text from public.bookings where idempotency_key = 'f0000000-0000-4000-8000-000000000002'), true);
set local role authenticated;

-- Other provider Q ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated","aal":"aal2"}', true);
select is_empty($$ select 1 from public.bookings $$, 'another provider cannot see these bookings');
select throws_ok($$ select public.respond_to_booking(current_setting('test.b1')::uuid, 'confirmed', 1, null) $$, 'P0002', null, 'another provider cannot confirm them');
select throws_ok(
  $$ insert into public.availability_slots (experience_id, starts_on, capacity) values ('e0000000-0000-4000-8000-000000000001', private.today_ist() + 20, 5) $$,
  '42501', null, 'another provider cannot add slots to this experience');
select is_empty(
  $$ update public.availability_slots set capacity = 50 where id = '50000000-0000-4000-8000-000000000001' returning 1 $$,
  'another provider cannot change this slot');

-- Provider P ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal2"}', true);
select results_eq(
  $$ select traveler_name, contact_phone from public.bookings order by created_at $$,
  $$ values ('traveler.one'::text, '+91 98765 43210'::text), ('traveler.two'::text, '+91 91234 56789'::text) $$,
  'the provider sees its bookings with the traveler''s name and booking phone');
select throws_ok($$ select * from public.request_booking('50000000-0000-4000-8000-000000000001', 1, 0, '+91 98765 43210', '', gen_random_uuid()) $$, '42501', null, 'providers cannot book their own experiences');
select throws_ok($$ select public.respond_to_booking(current_setting('test.b1')::uuid, 'confirmed', null, null) $$, '22023', null, 'confirming requires a final total');
select throws_ok($$ select public.respond_to_booking(current_setting('test.b1')::uuid, 'declined', null, '  ') $$, '22023', null, 'declining requires a reason');
select throws_ok($$ select public.respond_to_booking(current_setting('test.b1')::uuid, 'completed', 1, null) $$, '22023', null, 'providers cannot jump to other states');
select is(
  (select public.respond_to_booking(current_setting('test.b1')::uuid, 'confirmed', 210000, 'See you at 9am')),
  'confirmed'::public.booking_status, 'the provider confirms with a final price');
select throws_ok($$ select public.respond_to_booking(current_setting('test.b2')::uuid, 'confirmed', 200000, null) $$, '55000', null, 'confirmation re-checks seats: the date is now full');
select throws_ok($$ select public.respond_to_booking(current_setting('test.b1')::uuid, 'confirmed', 1, null) $$, '55000', null, 'a confirmed booking cannot be confirmed again');
select throws_ok($$ update public.availability_slots set capacity = 1 where id = '50000000-0000-4000-8000-000000000001' $$, '23514', null, 'capacity cannot drop below confirmed seats');
select throws_ok($$ update public.availability_slots set seats_confirmed = 0 $$, '42501', null, 'confirmed seats cannot be edited directly');
select throws_ok(
  $$ insert into public.availability_slots (experience_id, starts_on, capacity) values ('e0000000-0000-4000-8000-000000000001', private.today_ist() - 2, 5) $$,
  '42501', null, 'slots cannot be added in the past');

-- Price changes after the request don't rewrite the booking -----------------------------
reset role;
update public.experiences set price_from_minor = 999999 where id = 'e0000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select estimated_total_minor, confirmed_total_minor from public.bookings where id = current_setting('test.b1')::uuid $$,
  $$ values (200000::bigint, 210000::bigint) $$,
  'later price changes leave the estimate and confirmed price unchanged');

-- Cancellation ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}', true);
select is((select public.cancel_booking(current_setting('test.b1')::uuid, 'Plans changed')), 'cancelled'::public.booking_status, 'the traveler cancels a confirmed booking well ahead');
select throws_ok($$ select public.cancel_booking(current_setting('test.b1')::uuid, null) $$, '55000', null, 'a cancelled booking cannot be cancelled again');
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal2"}', true);
select is((select public.respond_to_booking(current_setting('test.b2')::uuid, 'confirmed', 200000, null)), 'confirmed'::public.booking_status, 'freed seats can be confirmed for the waiting traveler');
select throws_ok($$ select public.cancel_booking(current_setting('test.b2')::uuid, null) $$, '22023', null, 'providers must give a reason to cancel');
select is((select public.cancel_booking(current_setting('test.b2')::uuid, 'Guide unwell')), 'cancelled'::public.booking_status, 'the provider cancels with a reason');
reset role;
select is((select seats_confirmed from public.availability_slots where id = '50000000-0000-4000-8000-000000000001'), 0, 'cancellations release their seats');
select results_eq(
  $$ select from_status::text, to_status::text, actor_role::text from public.booking_events where booking_id = current_setting('test.b1')::uuid order by id $$,
  $$ values (null::text, 'requested'::text, 'traveler'::text), ('requested', 'confirmed', 'provider'), ('confirmed', 'cancelled', 'traveler') $$,
  'every transition is in the history with its actor');

-- 24-hour cancellation window ----------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}', true);
select lives_ok($$ select * from public.request_booking('50000000-0000-4000-8000-000000000007', 1, 0, '+91 98765 43210', '', 'f0000000-0000-4000-8000-000000000007') $$, 'requests close to the start are accepted');
reset role;
select set_config('test.b7', (select id::text from public.bookings where idempotency_key = 'f0000000-0000-4000-8000-000000000007'), true);
select ok(
  (select b.request_expires_at = private.slot_starts_at(s.starts_on, s.start_time)
   from public.bookings b join public.availability_slots s on s.id = b.slot_id where b.id = current_setting('test.b7')::uuid),
  'a request expires at the slot start when that comes before 48 hours');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal2"}', true);
select lives_ok($$ select public.respond_to_booking(current_setting('test.b7')::uuid, 'confirmed', 100000, null) $$, 'the provider confirms the short-notice booking');
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}', true);
select throws_ok($$ select public.cancel_booking(current_setting('test.b7')::uuid, null) $$, '55000', null, 'travelers cannot cancel within 24 hours of the start');

-- Expiry and completion --------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal2"}', true);
select lives_ok($$ select * from public.request_booking('50000000-0000-4000-8000-000000000006', 1, 0, '+91 91234 56789', '', 'f0000000-0000-4000-8000-000000000006') $$, 'a request to provider Q');
reset role;
select set_config('test.b6', (select id::text from public.bookings where idempotency_key = 'f0000000-0000-4000-8000-000000000006'), true);
update public.bookings set request_expires_at = now() - interval '1 minute' where id = current_setting('test.b6')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated","aal":"aal2"}', true);
select throws_ok($$ select public.respond_to_booking(current_setting('test.b6')::uuid, 'confirmed', 1, null) $$, '55000', null, 'overdue requests cannot be confirmed even before the sweep runs');
select throws_ok($$ select * from private.sweep_bookings() $$, '42501', null, 'API roles cannot run the sweep');
reset role;
update public.availability_slots set starts_on = private.today_ist() - 1 where id = '50000000-0000-4000-8000-000000000007';
select results_eq($$ select * from private.sweep_bookings() $$, $$ values (1, 1) $$, 'the sweep expires one request and completes one booking');
select results_eq(
  $$ select (select status::text from public.bookings where id = current_setting('test.b6')::uuid),
            (select status::text from public.bookings where id = current_setting('test.b7')::uuid) $$,
  $$ values ('expired'::text, 'completed'::text) $$,
  'statuses are materialised: overdue request expired, past booking completed');

-- Admin --------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated","aal":"aal2"}', true);
select is((select count(*) from public.bookings), 4::bigint, 'admins can read all bookings for support');

select * from finish();
rollback;
