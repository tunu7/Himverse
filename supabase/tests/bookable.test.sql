-- Everything bookable (migration 20261014205730, ADR-0004 amendments):
-- partner-controlled accepts_bookings, instant booking by date on published
-- slots only (migration instant_booking), whole itinerary booking, cancel and sweep.
begin;
create extension if not exists pgtap with schema extensions;

select plan(38);

truncate public.refunds, public.payments, public.partner_payouts, public.booking_events, public.bookings, public.availability_slots, public.itinerary_items,
  public.itinerary_versions, public.itinerary_generations, public.itineraries,
  public.experiences, public.destinations, public.provider_status_events,
  public.provider_private_details, public.provider_members, public.providers;

-- T, T2: travelers   P: owner of verified Pv   Q: owner of verified Qv
insert into auth.users (id, email, aud, role) values
  ('11111111-1111-4111-8111-111111111111', 'bk.traveler.one@example.test', 'authenticated', 'authenticated'),
  ('22222222-2222-4222-8222-222222222222', 'bk.traveler.two@example.test', 'authenticated', 'authenticated'),
  ('33333333-3333-4333-8333-333333333333', 'bk.owner.p@example.test', 'authenticated', 'authenticated'),
  ('44444444-4444-4444-8444-444444444444', 'bk.owner.q@example.test', 'authenticated', 'authenticated');
insert into public.providers (id, slug, display_name, status, verified_at) values
  ('a0000000-0000-4000-8000-000000000001', 'bk-pv', 'Pv', 'verified', now()),
  ('a0000000-0000-4000-8000-000000000002', 'bk-qv', 'Qv', 'verified', now());
insert into public.provider_members (provider_id, user_id) values
  ('a0000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333'),
  ('a0000000-0000-4000-8000-000000000002', '44444444-4444-4444-8444-444444444444');
insert into public.destinations (id, slug, name, district, is_published) values
  ('d0000000-0000-4000-8000-000000000001', 'bk-ziro', 'Ziro Valley', 'Lower Subansiri', true);
-- X1 bookable | X2 not accepting bookings | X3 bookable with a slot on day 12 | X4 by Q
insert into public.experiences (id, provider_id, destination_id, slug, title, category, duration_minutes, price_from_minor, status, accepts_bookings) values
  ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'bk-x1', 'X1 walk', 'culture', 120, 100000, 'published', true),
  ('e0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'bk-x2', 'X2 closed', 'nature', 120, 50000, 'published', false),
  ('e0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'bk-x3', 'X3 slots', 'nature', 120, 50000, 'published', true),
  ('e0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'bk-x4', 'X4 by Q', 'nature', 120, 70000, 'published', true);
insert into public.availability_slots (id, experience_id, starts_on, capacity) values
  ('50000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000003', private.today_ist() + 12, 2),
  ('50000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002', private.today_ist() + 12, 5),
  ('50000000-0000-4000-8000-000000000010', 'e0000000-0000-4000-8000-000000000001', private.today_ist() + 10, 5),
  ('50000000-0000-4000-8000-000000000011', 'e0000000-0000-4000-8000-000000000001', private.today_ist() + 1, 5),
  ('50000000-0000-4000-8000-000000000030', 'e0000000-0000-4000-8000-000000000001', private.today_ist() + 30, 10),
  ('50000000-0000-4000-8000-000000000031', 'e0000000-0000-4000-8000-000000000004', private.today_ist() + 31, 10),
  ('50000000-0000-4000-8000-000000000040', 'e0000000-0000-4000-8000-000000000001', private.today_ist() + 40, 5);

-- Defaults and partner control -------------------------------------------------------
select is((select column_default from information_schema.columns
           where table_schema = 'public' and table_name = 'experiences' and column_name = 'accepts_bookings'),
          'true', 'experiences accept bookings by default');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated","aal":"aal2"}', true);
select is_empty(
  $$ update public.experiences set accepts_bookings = false where id = 'e0000000-0000-4000-8000-000000000001' returning 1 $$,
  'another provider cannot change bookability');
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}', true);
select is_empty(
  $$ update public.experiences set accepts_bookings = false where id = 'e0000000-0000-4000-8000-000000000001' returning 1 $$,
  'travelers cannot change bookability');
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal2"}', true);
select results_eq(
  $$ update public.experiences set accepts_bookings = false where id = 'e0000000-0000-4000-8000-000000000002' returning accepts_bookings $$,
  $$ values (false) $$, 'the provider can switch bookings off for its own experience');

-- Anonymous -----------------------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select * from public.request_booking_on_date('e0000000-0000-4000-8000-000000000001', private.today_ist() + 10, 1, 0, '+91 98765 43210', '', gen_random_uuid()) $$,
  '42501', null, 'anon cannot request a date');
select throws_ok($$ select * from public.request_itinerary_bookings(gen_random_uuid(), '+91 98765 43210', '', gen_random_uuid()) $$,
  '42501', null, 'anon cannot book an itinerary');

-- Date requests -------------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}', true);
select results_eq(
  $$ select booking_status, replayed from public.request_booking_on_date('e0000000-0000-4000-8000-000000000001', private.today_ist() + 10, 2, 0, '+91 98765 43210', 'Veg', 'f0000000-0000-4000-8000-000000000001') $$,
  $$ values ('confirmed'::public.booking_status, false) $$,
  'a published date of a bookable experience is booked instantly');
select results_eq(
  $$ select replayed from public.request_booking_on_date('e0000000-0000-4000-8000-000000000001', private.today_ist() + 10, 2, 0, '+91 98765 43210', 'Veg', 'f0000000-0000-4000-8000-000000000001') $$,
  $$ values (true) $$, 'retrying a date booking replays it');
select throws_ok(
  $$ select * from public.request_booking_on_date('e0000000-0000-4000-8000-000000000001', private.today_ist() + 11, 2, 0, '+91 98765 43210', 'Veg', 'f0000000-0000-4000-8000-000000000001') $$,
  '22023', null, 'reusing a key for another date is rejected');
select throws_ok(
  $$ select * from public.request_booking_on_date('e0000000-0000-4000-8000-000000000001', private.today_ist() + 10, 1, 0, '+91 98765 43210', '', gen_random_uuid()) $$,
  '23505', null, 'one active booking per experience and date');
select throws_ok(
  $$ select * from public.request_booking_on_date('e0000000-0000-4000-8000-000000000002', private.today_ist() + 12, 1, 0, '+91 98765 43210', '', gen_random_uuid()) $$,
  'P0002', null, 'experiences that do not accept bookings cannot be booked');
select throws_ok(
  $$ select * from public.request_booking('50000000-0000-4000-8000-000000000002', 1, 0, '+91 98765 43210', '', gen_random_uuid()) $$,
  'P0002', null, 'their published slots cannot be booked either');
select throws_ok(
  $$ select * from public.request_booking_on_date('e0000000-0000-4000-8000-000000000001', private.today_ist(), 1, 0, '+91 98765 43210', '', gen_random_uuid()) $$,
  'P0002', null, 'today (already started) cannot be booked');
select throws_ok(
  $$ select * from public.request_booking_on_date('99999999-9999-4999-8999-999999999999', private.today_ist() + 10, 1, 0, '+91 98765 43210', '', gen_random_uuid()) $$,
  'P0002', null, 'unknown experiences get the same answer');
select throws_ok(
  $$ select * from public.request_booking_on_date('e0000000-0000-4000-8000-000000000001', private.today_ist() + 20, 1, 0, '+91 98765 43210', '', gen_random_uuid()) $$,
  'P0002', null, 'a date the provider has not published cannot be booked');
select lives_ok(
  $$ select * from public.request_booking_on_date('e0000000-0000-4000-8000-000000000003', private.today_ist() + 12, 2, 0, '+91 98765 43210', '', 'f0000000-0000-4000-8000-000000000003') $$,
  'another experience''s published date is booked');

reset role;
select results_eq(
  $$ select slot_id, status::text from public.bookings where idempotency_key = 'f0000000-0000-4000-8000-000000000001' $$,
  $$ values ('50000000-0000-4000-8000-000000000010'::uuid, 'confirmed'::text) $$,
  'the booking uses the published slot on that date');
select is(
  (select seats_confirmed from public.availability_slots where id = '50000000-0000-4000-8000-000000000001'), 2,
  'and its seats are taken at once');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal2"}', true);
select throws_ok(
  $$ select * from public.request_booking_on_date('e0000000-0000-4000-8000-000000000003', private.today_ist() + 12, 1, 0, '+91 98765 43210', '', gen_random_uuid()) $$,
  '55000', null, 'a full date refuses further bookings');
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal2"}', true);
select throws_ok(
  $$ select * from public.request_booking_on_date('e0000000-0000-4000-8000-000000000001', private.today_ist() + 10, 1, 0, '+91 98765 43210', '', gen_random_uuid()) $$,
  '42501', null, 'providers cannot book their own experiences');

-- Cancel -----------------------------------------------------------------------------------
reset role;
select set_config('test.d1', (select id::text from public.bookings where idempotency_key = 'f0000000-0000-4000-8000-000000000001'), true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated","aal":"aal2"}', true);
select throws_ok($$ select public.cancel_booking(current_setting('test.d1')::uuid, 'No guide') $$,
  'P0002', null, 'another provider cannot cancel the booking');
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}', true);
select is(public.cancel_booking(current_setting('test.d1')::uuid, null),
  'cancelled'::public.booking_status, 'the traveler cancels it more than 24 h ahead');

-- Security review follow-ups ----------------------------------------------------------------
reset role;
insert into public.availability_slots (id, experience_id, starts_on, capacity, status) values
  ('50000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000001', private.today_ist() + 15, 4, 'closed');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}', true);
select throws_ok(
  $$ select * from public.request_booking_on_date('e0000000-0000-4000-8000-000000000001', private.today_ist() + 15, 1, 0, '+91 98765 43210', '', gen_random_uuid()) $$,
  'P0002', null, 'a date the provider closed cannot be booked');
select throws_ok(
  $$ select * from public.request_booking_on_date('e0000000-0000-4000-8000-000000000001', private.today_ist() + 731, 1, 0, '+91 98765 43210', '', gen_random_uuid()) $$,
  'P0002', null, 'dates more than two years ahead are refused');
select lives_ok(
  $$ select * from public.request_booking_on_date('e0000000-0000-4000-8000-000000000001', private.today_ist() + 40, 2, 0, '+91 98765 43210', '', 'f0000000-0000-4000-8000-000000000040') $$,
  'a booking on a published date');
reset role;
update public.availability_slots set status = 'closed' where id = '50000000-0000-4000-8000-000000000040';
set local role authenticated;
select results_eq(
  $$ select replayed from public.request_booking_on_date('e0000000-0000-4000-8000-000000000001', private.today_ist() + 40, 2, 0, '+91 98765 43210', '', 'f0000000-0000-4000-8000-000000000040') $$,
  $$ values (true) $$, 'a retry still replays after the provider closes the date');
select results_eq(
  $$ select replayed from public.request_booking('50000000-0000-4000-8000-000000000040', 2, 0, '+91 98765 43210', '', 'f0000000-0000-4000-8000-000000000040') $$,
  $$ values (true) $$, 'the same key as a slot request replays the date booking on that slot');

select lives_ok(
  $$ select * from public.request_booking_on_date('e0000000-0000-4000-8000-000000000001', private.today_ist() + 1, 1, 0, '+91 98765 43210', '', 'f0000000-0000-4000-8000-0000000001b1') $$,
  'a booking for tomorrow');
reset role;
select set_config('test.d1b', (select id::text from public.bookings where idempotency_key = 'f0000000-0000-4000-8000-0000000001b1'), true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal2"}', true);
select throws_ok($$ select public.cancel_booking(current_setting('test.d1b')::uuid, null) $$,
  'P0002', null, 'another traveler cannot cancel it');
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}', true);
select throws_ok($$ select public.cancel_booking(current_setting('test.d1b')::uuid, null) $$,
  '55000', null, 'confirmed bookings cannot be cancelled within 24 hours of the date');

-- Whole itinerary ------------------------------------------------------------------------
reset role;
insert into public.itineraries (id, owner_id, title)
values ('10000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Ziro trip');
insert into public.itinerary_versions (id, itinerary_id, version_number, kind, preferences, plan, schema_version,
  prompt_version, model, travelers, estimated_total_minor, unpriced_item_count)
values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 1, 'generate',
  jsonb_build_object('startDate', (private.today_ist() + 30)::text, 'adults', 2, 'children', 1),
  '{}', 'itinerary.v1', 'itinerary-v2', 'mock', 3, 0, 0);
insert into public.itinerary_items (id, version_id, day_number, position, experience_id, destination_id,
  experience_title_snapshot, destination_name_snapshot, time_of_day, duration_snapshot_minutes) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 1, 1, 'e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'X1 walk', 'Ziro Valley', 'morning', 120),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 2, 1, 'e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'X2 closed', 'Ziro Valley', 'morning', 120),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 2, 2, 'e0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000001', 'X4 by Q', 'Ziro Valley', 'afternoon', 120);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal2"}', true);
select throws_ok(
  $$ select * from public.request_itinerary_bookings('20000000-0000-4000-8000-000000000001', '+91 91234 56789', '', gen_random_uuid()) $$,
  'P0002', null, 'only the owner can book an itinerary');
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}', true);
select results_eq(
  $$ select item_id, booking_status, error_code from public.request_itinerary_bookings(
       '20000000-0000-4000-8000-000000000001', '+91 98765 43210', 'Trip', 'f0000000-0000-4000-8000-0000000000aa') $$,
  $$ values ('30000000-0000-4000-8000-000000000001'::uuid, 'confirmed'::public.booking_status, null::text),
            ('30000000-0000-4000-8000-000000000002'::uuid, null::public.booking_status, 'P0002'::text),
            ('30000000-0000-4000-8000-000000000003'::uuid, 'confirmed'::public.booking_status, null::text) $$,
  'each item is booked independently and confirmed instantly; unbookable ones report why');
select results_eq(
  $$ select experience_id, slot_starts_on - private.today_ist(), adults, children, provider_id from public.bookings
     where traveler_id = '11111111-1111-4111-8111-111111111111' and traveler_note = 'Trip' order by slot_starts_on $$,
  $$ values ('e0000000-0000-4000-8000-000000000001'::uuid, 30, 2, 1, 'a0000000-0000-4000-8000-000000000001'::uuid),
            ('e0000000-0000-4000-8000-000000000004'::uuid, 31, 2, 1, 'a0000000-0000-4000-8000-000000000002'::uuid) $$,
  'dates and party come from the stored itinerary; each provider gets its own booking');
select results_eq(
  $$ select count(*) filter (where error_code is null), bool_and(replayed) from public.request_itinerary_bookings(
       '20000000-0000-4000-8000-000000000001', '+91 98765 43210', 'Trip', 'f0000000-0000-4000-8000-0000000000aa') $$,
  $$ values (2::bigint, true) $$, 'retrying the whole trip replays instead of duplicating');
select is((select count(*) from public.bookings where traveler_note = 'Trip'), 2::bigint, 'no duplicate bookings');
select results_eq(
  $$ select error_code from public.request_itinerary_bookings(
       '20000000-0000-4000-8000-000000000001', '+91 98765 43210', 'Trip', gen_random_uuid())
     where item_id <> '30000000-0000-4000-8000-000000000002' $$,
  $$ values ('23505'::text), ('23505'::text) $$, 'a second click with a new key reports the existing bookings');
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated","aal":"aal2"}', true);
select is((select count(*) from public.bookings), 1::bigint, 'provider Q sees only its own trip booking');

-- Sweep completes past bookings -------------------------------------------------------------
reset role;
update public.availability_slots set starts_on = private.today_ist() - 1 where id = '50000000-0000-4000-8000-000000000031';
select results_eq($$ select completed_count from private.sweep_bookings() $$, $$ values (1) $$,
  'the sweep completes a past booking');

select * from finish();
rollback;
