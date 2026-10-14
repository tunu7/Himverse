-- Everything bookable (migration 20261014205730, ADR-0004 amendment):
-- partner-controlled accepts_bookings, date requests without a slot, whole
-- itinerary booking, and confirm/cancel/sweep for slot-less bookings.
begin;
create extension if not exists pgtap with schema extensions;

select plan(41);

truncate public.booking_events, public.bookings, public.availability_slots, public.itinerary_items,
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
-- X1 bookable, no slots | X2 not accepting bookings | X3 bookable with a slot on day 12 | X4 by Q
insert into public.experiences (id, provider_id, destination_id, slug, title, category, duration_minutes, price_from_minor, status, accepts_bookings) values
  ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'bk-x1', 'X1 walk', 'culture', 120, 100000, 'published', true),
  ('e0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'bk-x2', 'X2 closed', 'nature', 120, 50000, 'published', false),
  ('e0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'bk-x3', 'X3 slots', 'nature', 120, 50000, 'published', true),
  ('e0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'bk-x4', 'X4 by Q', 'nature', 120, 70000, 'published', true);
insert into public.availability_slots (id, experience_id, starts_on, capacity) values
  ('50000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000003', private.today_ist() + 12, 2),
  ('50000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002', private.today_ist() + 12, 5);

-- Defaults and partner control -------------------------------------------------------
select is((select column_default from information_schema.columns
           where table_schema = 'public' and table_name = 'experiences' and column_name = 'accepts_bookings'),
          'true', 'experiences accept bookings by default');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
select is_empty(
  $$ update public.experiences set accepts_bookings = false where id = 'e0000000-0000-4000-8000-000000000001' returning 1 $$,
  'another provider cannot change bookability');
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select is_empty(
  $$ update public.experiences set accepts_bookings = false where id = 'e0000000-0000-4000-8000-000000000001' returning 1 $$,
  'travelers cannot change bookability');
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
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
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select results_eq(
  $$ select booking_status, replayed from public.request_booking_on_date('e0000000-0000-4000-8000-000000000001', private.today_ist() + 10, 2, 0, '+91 98765 43210', 'Veg', 'f0000000-0000-4000-8000-000000000001') $$,
  $$ values ('requested'::public.booking_status, false) $$,
  'any future date of a bookable experience can be requested without a slot');
select results_eq(
  $$ select replayed from public.request_booking_on_date('e0000000-0000-4000-8000-000000000001', private.today_ist() + 10, 2, 0, '+91 98765 43210', 'Veg', 'f0000000-0000-4000-8000-000000000001') $$,
  $$ values (true) $$, 'retrying a date request replays it');
select throws_ok(
  $$ select * from public.request_booking_on_date('e0000000-0000-4000-8000-000000000001', private.today_ist() + 11, 2, 0, '+91 98765 43210', 'Veg', 'f0000000-0000-4000-8000-000000000001') $$,
  '22023', null, 'reusing a key for another date is rejected');
select throws_ok(
  $$ select * from public.request_booking_on_date('e0000000-0000-4000-8000-000000000001', private.today_ist() + 10, 1, 0, '+91 98765 43210', '', gen_random_uuid()) $$,
  '23505', null, 'one active request per experience and date');
select throws_ok(
  $$ select * from public.request_booking_on_date('e0000000-0000-4000-8000-000000000002', private.today_ist() + 10, 1, 0, '+91 98765 43210', '', gen_random_uuid()) $$,
  'P0002', null, 'experiences that do not accept bookings cannot be requested');
select throws_ok(
  $$ select * from public.request_booking('50000000-0000-4000-8000-000000000002', 1, 0, '+91 98765 43210', '', gen_random_uuid()) $$,
  'P0002', null, 'their published slots cannot be booked either');
select throws_ok(
  $$ select * from public.request_booking_on_date('e0000000-0000-4000-8000-000000000001', private.today_ist(), 1, 0, '+91 98765 43210', '', gen_random_uuid()) $$,
  'P0002', null, 'today (already started) cannot be requested');
select throws_ok(
  $$ select * from public.request_booking_on_date('99999999-9999-4999-8999-999999999999', private.today_ist() + 10, 1, 0, '+91 98765 43210', '', gen_random_uuid()) $$,
  'P0002', null, 'unknown experiences get the same answer');
select lives_ok(
  $$ select * from public.request_booking_on_date('e0000000-0000-4000-8000-000000000003', private.today_ist() + 12, 2, 0, '+91 98765 43210', '', 'f0000000-0000-4000-8000-000000000003') $$,
  'a date with a published slot is requested');

reset role;
select results_eq(
  $$ select slot_id, request_expires_at <= now() + interval '48 hours' from public.bookings
     where idempotency_key = 'f0000000-0000-4000-8000-000000000001' $$,
  $$ values (null::uuid, true) $$, 'the date request has no slot and the usual 48 h expiry');
select is(
  (select slot_id from public.bookings where idempotency_key = 'f0000000-0000-4000-8000-000000000003'),
  '50000000-0000-4000-8000-000000000001'::uuid, 'a published slot on that date is used (seat limits apply)');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.request_booking_on_date('e0000000-0000-4000-8000-000000000003', private.today_ist() + 12, 3, 0, '+91 98765 43210', '', gen_random_uuid()) $$,
  '55000', null, 'seat limits still apply on dates with a published slot');
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.request_booking_on_date('e0000000-0000-4000-8000-000000000001', private.today_ist() + 20, 1, 0, '+91 98765 43210', '', gen_random_uuid()) $$,
  '42501', null, 'providers cannot request their own experiences');

-- Confirm and cancel without a slot ---------------------------------------------------------
reset role;
select set_config('test.d1', (select id::text from public.bookings where idempotency_key = 'f0000000-0000-4000-8000-000000000001'), true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
select throws_ok($$ select public.respond_to_booking(current_setting('test.d1')::uuid, 'confirmed', 200000, null) $$,
  'P0002', null, 'another provider cannot confirm a date request');
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
select is(public.respond_to_booking(current_setting('test.d1')::uuid, 'confirmed', 200000, 'See you'),
  'confirmed'::public.booking_status, 'the provider confirms a date request');
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select is(public.cancel_booking(current_setting('test.d1')::uuid, null),
  'cancelled'::public.booking_status, 'the traveler cancels it more than 24 h ahead');

-- Security review follow-ups ----------------------------------------------------------------
reset role;
insert into public.availability_slots (id, experience_id, starts_on, capacity, status) values
  ('50000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000001', private.today_ist() + 15, 4, 'closed');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.request_booking_on_date('e0000000-0000-4000-8000-000000000001', private.today_ist() + 15, 1, 0, '+91 98765 43210', '', gen_random_uuid()) $$,
  'P0002', null, 'a date the provider closed cannot be requested as a plain date');
select throws_ok(
  $$ select * from public.request_booking_on_date('e0000000-0000-4000-8000-000000000001', private.today_ist() + 731, 1, 0, '+91 98765 43210', '', gen_random_uuid()) $$,
  'P0002', null, 'dates more than two years ahead are refused');
select lives_ok(
  $$ select * from public.request_booking_on_date('e0000000-0000-4000-8000-000000000001', private.today_ist() + 40, 2, 0, '+91 98765 43210', '', 'f0000000-0000-4000-8000-000000000040') $$,
  'a date request before the provider publishes that date');
reset role;
insert into public.availability_slots (id, experience_id, starts_on, capacity) values
  ('50000000-0000-4000-8000-000000000040', 'e0000000-0000-4000-8000-000000000001', private.today_ist() + 40, 3);
set local role authenticated;
select results_eq(
  $$ select replayed from public.request_booking_on_date('e0000000-0000-4000-8000-000000000001', private.today_ist() + 40, 2, 0, '+91 98765 43210', '', 'f0000000-0000-4000-8000-000000000040') $$,
  $$ values (true) $$, 'a retry still replays after the provider publishes the date');
select throws_ok(
  $$ select * from public.request_booking('50000000-0000-4000-8000-000000000040', 2, 0, '+91 98765 43210', '', 'f0000000-0000-4000-8000-000000000040') $$,
  '22023', null, 'a date request''s key cannot be reused for a slot request');
reset role;
select set_config('test.d40', (select id::text from public.bookings where idempotency_key = 'f0000000-0000-4000-8000-000000000040'), true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
select is(public.respond_to_booking(current_setting('test.d40')::uuid, 'confirmed', 1, null),
  'confirmed'::public.booking_status, 'the provider confirms it');
reset role;
select results_eq(
  $$ select b.slot_id, s.seats_confirmed from public.bookings b join public.availability_slots s on s.id = b.slot_id
     where b.id = current_setting('test.d40')::uuid $$,
  $$ values ('50000000-0000-4000-8000-000000000040'::uuid, 2) $$,
  'confirming counts the party against the slot published since (no overbooking)');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select lives_ok(
  $$ select * from public.request_booking_on_date('e0000000-0000-4000-8000-000000000001', private.today_ist() + 1, 1, 0, '+91 98765 43210', '', 'f0000000-0000-4000-8000-0000000001b1') $$,
  'a request for tomorrow');
reset role;
select set_config('test.d1b', (select id::text from public.bookings where idempotency_key = 'f0000000-0000-4000-8000-0000000001b1'), true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select throws_ok($$ select public.cancel_booking(current_setting('test.d1b')::uuid, null) $$,
  'P0002', null, 'another traveler cannot cancel a date request');
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
select lives_ok($$ select public.respond_to_booking(current_setting('test.d1b')::uuid, 'confirmed', 1, null) $$,
  'the provider confirms the short-notice date request');
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select throws_ok($$ select public.cancel_booking(current_setting('test.d1b')::uuid, null) $$,
  '55000', null, 'confirmed date requests cannot be cancelled within 24 hours of the date');

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
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.request_itinerary_bookings('20000000-0000-4000-8000-000000000001', '+91 91234 56789', '', gen_random_uuid()) $$,
  'P0002', null, 'only the owner can book an itinerary');
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select results_eq(
  $$ select item_id, booking_status, error_code from public.request_itinerary_bookings(
       '20000000-0000-4000-8000-000000000001', '+91 98765 43210', 'Trip', 'f0000000-0000-4000-8000-0000000000aa') $$,
  $$ values ('30000000-0000-4000-8000-000000000001'::uuid, 'requested'::public.booking_status, null::text),
            ('30000000-0000-4000-8000-000000000002'::uuid, null::public.booking_status, 'P0002'::text),
            ('30000000-0000-4000-8000-000000000003'::uuid, 'requested'::public.booking_status, null::text) $$,
  'each item is requested independently; unbookable ones report why');
select results_eq(
  $$ select experience_id, slot_starts_on - private.today_ist(), adults, children, provider_id from public.bookings
     where traveler_id = '11111111-1111-4111-8111-111111111111' and traveler_note = 'Trip' order by slot_starts_on $$,
  $$ values ('e0000000-0000-4000-8000-000000000001'::uuid, 30, 2, 1, 'a0000000-0000-4000-8000-000000000001'::uuid),
            ('e0000000-0000-4000-8000-000000000004'::uuid, 31, 2, 1, 'a0000000-0000-4000-8000-000000000002'::uuid) $$,
  'dates and party come from the stored itinerary; each provider gets its own request');
select results_eq(
  $$ select bool_and(coalesce(replayed, true)) from public.request_itinerary_bookings(
       '20000000-0000-4000-8000-000000000001', '+91 98765 43210', 'Trip', 'f0000000-0000-4000-8000-0000000000aa') $$,
  $$ values (true) $$, 'retrying the whole trip replays instead of duplicating');
select is((select count(*) from public.bookings where traveler_note = 'Trip'), 2::bigint, 'no duplicate requests');
select results_eq(
  $$ select error_code from public.request_itinerary_bookings(
       '20000000-0000-4000-8000-000000000001', '+91 98765 43210', 'Trip', gen_random_uuid())
     where item_id <> '30000000-0000-4000-8000-000000000002' $$,
  $$ values ('23505'::text), ('23505'::text) $$, 'a second click with a new key reports the existing requests');
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
select is((select count(*) from public.bookings), 1::bigint, 'provider Q sees only its own trip request');

-- Sweep completes past slot-less bookings ---------------------------------------------------
reset role;
update public.bookings set status = 'confirmed', confirmed_total_minor = 1, slot_starts_on = private.today_ist() - 1
where traveler_note = 'Trip' and experience_id = 'e0000000-0000-4000-8000-000000000004';
select results_eq($$ select completed_count from private.sweep_bookings() $$, $$ values (1) $$,
  'the sweep completes a past booking that has no slot');

select * from finish();
rollback;
