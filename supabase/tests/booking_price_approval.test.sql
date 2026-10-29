-- Price approval (migration booking_price_approval): totals more than 10% above
-- the estimate, or with no estimate, need the traveller's acceptance. Since
-- instant booking (migration instant_booking) this applies to listings without a
-- price and to requests made before that migration, which the fixtures emulate.
begin;
create extension if not exists pgtap with schema extensions;

select plan(29);

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('a1111111-1111-4111-8111-111111111111', 'pa.traveller@example.test', 'authenticated', 'authenticated', '{"account_type":"traveller"}'),
  ('a2222222-2222-4222-8222-222222222222', 'pa.other@example.test', 'authenticated', 'authenticated', '{"account_type":"traveller"}'),
  ('a3333333-3333-4333-8333-333333333333', 'pa.partner@example.test', 'authenticated', 'authenticated', '{"account_type":"partner"}');
insert into public.providers (id, slug, display_name, status, verified_at)
values ('ac000000-0000-4000-8000-000000000001', 'pa-provider', 'PA Provider', 'verified', now());
insert into public.provider_members (provider_id, user_id)
values ('ac000000-0000-4000-8000-000000000001', 'a3333333-3333-4333-8333-333333333333');
insert into public.destinations (id, slug, name, district, is_published)
values ('ad000000-0000-4000-8000-000000000001', 'pa-ziro', 'PA Ziro', 'Lower Subansiri', true);
-- A priced room (300000 per night) and an unpriced one (price on request).
insert into public.experiences (id, provider_id, destination_id, slug, title, category, duration_minutes, price_from_minor, status,
  listing_type, price_unit, daily_capacity, max_guests, languages) values
  ('ae000000-0000-4000-8000-000000000001', 'ac000000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001',
   'pa-room', 'Priced room', 'culture', 1440, 300000, 'published', 'stay', 'per_room_night', 5, 3, '{}'),
  ('ae000000-0000-4000-8000-000000000002', 'ac000000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001',
   'pa-room-unpriced', 'Unpriced room', 'culture', 1440, null, 'published', 'stay', 'per_room_night', 5, 3, '{}');

-- now() is fixed inside the test transaction; let alerts compare against an earlier visit.
update public.profiles set bookings_seen_at = now() - interval '1 hour'
where id = 'a1111111-1111-4111-8111-111111111111';

-- Requests made before instant booking: create them while the room has no price,
-- then give them the estimate they would have had (300000 each), one unpriced.
update public.experiences set price_from_minor = null where id = 'ae000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select * from public.request_listing_booking('ae000000-0000-4000-8000-000000000001', private.today_ist() + 10, private.today_ist() + 10,
  1, 2, 0, '+91 98765 43210', '', '', 'f3000000-0000-4000-8000-000000000001');
select * from public.request_listing_booking('ae000000-0000-4000-8000-000000000001', private.today_ist() + 11, private.today_ist() + 11,
  1, 2, 0, '+91 98765 43210', '', '', 'f3000000-0000-4000-8000-000000000002');
select * from public.request_listing_booking('ae000000-0000-4000-8000-000000000001', private.today_ist() + 12, private.today_ist() + 12,
  1, 2, 0, '+91 98765 43210', '', '', 'f3000000-0000-4000-8000-000000000003');
select * from public.request_listing_booking('ae000000-0000-4000-8000-000000000001', private.today_ist() + 13, private.today_ist() + 13,
  1, 2, 0, '+91 98765 43210', '', '', 'f3000000-0000-4000-8000-000000000004');
select * from public.request_listing_booking('ae000000-0000-4000-8000-000000000002', private.today_ist() + 14, private.today_ist() + 14,
  1, 2, 0, '+91 98765 43210', '', '', 'f3000000-0000-4000-8000-000000000005');
select * from public.request_listing_booking('ae000000-0000-4000-8000-000000000001', private.today_ist() + 15, private.today_ist() + 15,
  1, 2, 0, '+91 98765 43210', '', '', 'f3000000-0000-4000-8000-000000000006');
select * from public.request_listing_booking('ae000000-0000-4000-8000-000000000001', private.today_ist() + 1, private.today_ist() + 1,
  1, 2, 0, '+91 98765 43210', '', '', 'f3000000-0000-4000-8000-000000000007');

create temp table b as
  select idempotency_key as k, id from public.bookings
  where idempotency_key::text like 'f3000000-%';
grant select on b to authenticated;
reset role;
update public.bookings set estimated_total_minor = 300000
where experience_id = 'ae000000-0000-4000-8000-000000000001' and idempotency_key::text like 'f3000000-%';
update public.experiences set price_from_minor = 300000 where id = 'ae000000-0000-4000-8000-000000000001';
set local role authenticated;

-- Partner -------------------------------------------------------------------------------
-- Before the second step, the partner holds no provider authority.
select set_config('request.jwt.claims', '{"sub":"a3333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal1"}', true);
select throws_ok(
  $$ select public.respond_to_booking((select id from b where k = 'f3000000-0000-4000-8000-000000000006'), 'confirmed', 999999, null) $$,
  'P0002', null,
  'a partner at aal1 cannot propose');
select set_config('request.jwt.claims', '{"sub":"a3333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal2"}', true);
select is(
  public.respond_to_booking((select id from b where k = 'f3000000-0000-4000-8000-000000000001'), 'confirmed', 330000, null),
  'confirmed'::public.booking_status,
  'exactly 10% above the estimate confirms directly');
select is(
  public.respond_to_booking((select id from b where k = 'f3000000-0000-4000-8000-000000000002'), 'confirmed', 330001, 'Peak season'),
  'requested'::public.booking_status,
  'more than 10% above the estimate becomes a proposal');
select results_eq(
  $$ select status::text, proposed_total_minor, confirmed_total_minor, price_proposed_at is not null, provider_note
     from public.bookings where id = (select id from b where k = 'f3000000-0000-4000-8000-000000000002') $$,
  $$ values ('requested', 330001::bigint, null::bigint, true, 'Peak season') $$,
  'the proposal is stored; nothing is confirmed');
select throws_ok(
  $$ select public.respond_to_booking((select id from b where k = 'f3000000-0000-4000-8000-000000000002'), 'confirmed', 300000, null) $$,
  '55000', null,
  'the partner cannot confirm while the traveller decides');
select is(
  public.respond_to_booking((select id from b where k = 'f3000000-0000-4000-8000-000000000005'), 'confirmed', 100, null),
  'requested'::public.booking_status,
  'with no estimate, any total needs approval');
select is(
  public.respond_to_booking((select id from b where k = 'f3000000-0000-4000-8000-000000000003'), 'confirmed', 500000, null),
  'requested'::public.booking_status,
  'a second proposal');
select is(
  public.respond_to_booking((select id from b where k = 'f3000000-0000-4000-8000-000000000004'), 'confirmed', 500000, null),
  'requested'::public.booking_status,
  'a third proposal');
select is(
  public.respond_to_booking((select id from b where k = 'f3000000-0000-4000-8000-000000000004'), 'confirmed', 500000, null),
  'requested'::public.booking_status,
  'retrying the same proposal replays');
select throws_ok(
  $$ select public.accept_booking_price((select id from b where k = 'f3000000-0000-4000-8000-000000000003'), 500000) $$,
  'P0002', null,
  'the partner cannot accept on the traveller''s behalf');
select is(
  public.respond_to_booking((select id from b where k = 'f3000000-0000-4000-8000-000000000005'), 'declined', null, 'Mistyped the price'),
  'declined'::public.booking_status,
  'the partner can still decline while a proposal is open');
select is(
  public.respond_to_booking((select id from b where k = 'f3000000-0000-4000-8000-000000000007'), 'confirmed', 900000, null),
  'requested'::public.booking_status,
  'a proposal for tomorrow');
select is(
  public.respond_to_booking((select id from b where k = 'f3000000-0000-4000-8000-000000000006'), 'confirmed', 900000, null),
  'requested'::public.booking_status,
  'a proposal the provider can no longer honour');
select results_eq(
  $$ select needs_response from public.partner_booking_alerts() $$,
  $$ values (0) $$,
  'proposals are not counted as waiting on the partner');

-- Traveller -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a2222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select throws_ok(
  $$ select public.accept_booking_price((select id from b where k = 'f3000000-0000-4000-8000-000000000002'), 330001) $$,
  'P0002', null,
  'another traveller cannot accept the price');

select set_config('request.jwt.claims', '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select ok(
  exists (select 1 from public.my_booking_updates() where booking_id = (select id from b where k = 'f3000000-0000-4000-8000-000000000002')),
  'the proposal shows in the traveller''s booking alerts');
select throws_ok(
  $$ select public.accept_booking_price((select id from b where k = 'f3000000-0000-4000-8000-000000000002'), 330000) $$,
  '22023', null,
  'accepting a different total than proposed is refused');
select throws_ok(
  $$ select public.accept_booking_price((select id from b where k = 'f3000000-0000-4000-8000-000000000001'), 330000) $$,
  '55000', null,
  'nothing to accept on a booking without a proposal');
-- With deposits on (ADR-0005), an accepted proposal gets its deposit terms like any confirmation.
reset role;
update public.platform_settings set deposits_required = true where id;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select is(
  public.accept_booking_price((select id from b where k = 'f3000000-0000-4000-8000-000000000002'), 330001),
  'confirmed'::public.booking_status,
  'the traveller accepts the proposed total');
select results_eq(
  $$ select status::text, confirmed_total_minor from public.bookings where id = (select id from b where k = 'f3000000-0000-4000-8000-000000000002') $$,
  $$ values ('confirmed', 330001::bigint) $$,
  'the booking is confirmed at the proposed total');
select ok(
  (select deposit_minor = 165001 and payment_due_at is not null
   from public.bookings where id = (select id from b where k = 'f3000000-0000-4000-8000-000000000002')),
  'the accepted total gets a 50% deposit and a payment deadline');
select is(
  public.accept_booking_price((select id from b where k = 'f3000000-0000-4000-8000-000000000002'), 330001),
  'confirmed'::public.booking_status,
  'a retry after acceptance replays');
select is(
  public.cancel_booking((select id from b where k = 'f3000000-0000-4000-8000-000000000003'), 'Too expensive'),
  'cancelled'::public.booking_status,
  'the traveller declines a proposal by cancelling the request');

-- Expiry --------------------------------------------------------------------------------
reset role;
select ok(
  (select request_expires_at <= now() + interval '48 hours' and request_expires_at > now() + interval '47 hours'
   from public.bookings where id = (select id from b where k = 'f3000000-0000-4000-8000-000000000004')),
  'a proposal gives the traveller 48 hours');
update public.bookings set request_expires_at = now() - interval '1 minute'
where id = (select id from b where k = 'f3000000-0000-4000-8000-000000000004');
select results_eq(
  $$ select expired_count from private.sweep_bookings() $$,
  $$ values (1) $$,
  'the sweep expires the unanswered proposal');
select results_eq(
  $$ select e.note from public.booking_events e
     where e.booking_id = (select id from b where k = 'f3000000-0000-4000-8000-000000000004') and e.to_status = 'expired' $$,
  $$ values ('The traveller didn''t accept the proposed price before the deadline.'::text) $$,
  'the expiry explains the proposal ran out');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select throws_ok(
  $$ select public.accept_booking_price((select id from b where k = 'f3000000-0000-4000-8000-000000000004'), 500000) $$,
  '55000', null,
  'an expired proposal cannot be accepted');


reset role;
select ok(
  (select request_expires_at = private.slot_starts_at(slot_starts_on, slot_start_time)
   from public.bookings where id = (select id from b where k = 'f3000000-0000-4000-8000-000000000007')),
  'a proposal never outlasts the start');

-- A suspended provider can't take the booking, even if the traveller accepts.
-- Owner SQL, outside any user session (the two-step guard applies to API callers).
select set_config('request.jwt.claims', '', true);
update public.providers set status = 'suspended' where id = 'ac000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select throws_ok(
  $$ select public.accept_booking_price((select id from b where k = 'f3000000-0000-4000-8000-000000000006'), 900000) $$,
  '55000', null,
  'acceptance is refused once the provider is suspended');

select * from finish();
rollback;
