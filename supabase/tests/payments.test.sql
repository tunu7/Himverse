-- Online deposits (migration payments, ADR-0005): the admin switch, deposit terms
-- on confirmation, checkout, system-only payment recording, refunds by
-- cancellation timing (claimed once), unpaid cancellation with a grace period,
-- held vs payable partner balances and payouts.
begin;
create extension if not exists pgtap with schema extensions;

select plan(56);

-- T, U: travellers   P: partner of Pv   Q: partner of Qv   A: admin
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('fa111111-1111-4111-8111-111111111111', 'pay.t@example.test', 'authenticated', 'authenticated', '{"account_type":"traveller"}'),
  ('fa222222-2222-4222-8222-222222222222', 'pay.u@example.test', 'authenticated', 'authenticated', '{"account_type":"traveller"}'),
  ('fa333333-3333-4333-8333-333333333333', 'pay.p@example.test', 'authenticated', 'authenticated', '{"account_type":"partner"}'),
  ('fa444444-4444-4444-8444-444444444444', 'pay.q@example.test', 'authenticated', 'authenticated', '{"account_type":"partner"}'),
  ('fa555555-5555-4555-8555-555555555555', 'pay.a@example.test', 'authenticated', 'authenticated', '{"account_type":"traveller"}');
insert into public.user_roles (user_id, role) values ('fa555555-5555-4555-8555-555555555555', 'admin');
insert into public.providers (id, slug, display_name, status, verified_at) values
  ('fa000000-0000-4000-8000-000000000001', 'pay-pv', 'Pv', 'verified', now()),
  ('fa000000-0000-4000-8000-000000000002', 'pay-qv', 'Qv', 'verified', now());
insert into public.provider_members (provider_id, user_id) values
  ('fa000000-0000-4000-8000-000000000001', 'fa333333-3333-4333-8333-333333333333'),
  ('fa000000-0000-4000-8000-000000000002', 'fa444444-4444-4444-8444-444444444444');
insert into public.destinations (id, slug, name, district, is_published)
values ('fa100000-0000-4000-8000-000000000001', 'pay-ziro', 'Pay Ziro', 'Lower Subansiri', true);
insert into public.experiences (id, provider_id, destination_id, slug, title, category, duration_minutes, price_from_minor, status)
values ('fa200000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000001', 'fa100000-0000-4000-8000-000000000001',
  'pay-walk', 'Pay walk', 'culture', 120, 100001, 'published');

create temp table ids (label text primary key, id uuid) on commit drop;
grant all on ids to authenticated, service_role;

-- T requests seven trips (2 adults, estimate 2 x 1000.01 = 2000.02).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"fa111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}', true);
insert into ids select l.label, r.booking_id
from (values ('before', 31), ('far', 30), ('near', 3), ('partner', 20), ('unpaid', 25), ('kept', 35), ('grace', 36)) l(label, days)
cross join lateral public.request_booking_on_date('fa200000-0000-4000-8000-000000000001', private.today_ist() + l.days, 2, 0,
  '+91 98765 43210', '', gen_random_uuid()) r;

-- The switch -----------------------------------------------------------------------------------
select is((select deposits_required from public.platform_settings), false, 'deposits are off by default');
select set_config('request.jwt.claims', '{"sub":"fa333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal2"}', true);
select public.respond_to_booking((select id from ids where label = 'before'), 'confirmed', 200002, null);
select is((select deposit_minor from public.bookings where id = (select id from ids where label = 'before')), null::bigint,
  'with deposits off, confirmed bookings need no deposit');
select throws_ok($$ select public.set_deposits_required(true) $$, '42501', null, 'partners cannot turn deposits on');
select set_config('request.jwt.claims', '{"sub":"fa555555-5555-4555-8555-555555555555","role":"authenticated","aal":"aal1"}', true);
select throws_ok($$ select public.set_deposits_required(true) $$, '42501', null, 'admins need two-step login');
select set_config('request.jwt.claims', '{"sub":"fa555555-5555-4555-8555-555555555555","role":"authenticated","aal":"aal2"}', true);
select is(public.set_deposits_required(true), true, 'an admin turns deposits on');

-- Deposit terms on confirmation ----------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"fa333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal2"}', true);
select public.respond_to_booking(id, 'confirmed', 200002, null) from ids where label not in ('before');
select results_eq(
  $$ select deposit_minor, payment_due_at <= now() + interval '24 hours', payment_due_at > now()
     from public.bookings where id = (select id from ids where label = 'far') $$,
  $$ values (100001::bigint, true, true) $$, 'the deposit is half the confirmed total, rounded up, due within 24 hours');

-- Checkout -------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"fa222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal1"}', true);
select throws_ok($$ select * from public.deposit_checkout((select id from ids where label = 'far')) $$, 'P0002', null,
  'another traveller cannot pay someone else''s booking');
select set_config('request.jwt.claims', '{"sub":"fa111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}', true);
select throws_ok($$ select * from public.deposit_checkout((select id from ids where label = 'before')) $$, '55000', null,
  'no deposit on a booking confirmed before the switch');
select results_eq(
  $$ select amount_minor, currency, attempt, reusable_order_id from public.deposit_checkout((select id from ids where label = 'far')) $$,
  $$ values (100001::bigint, 'INR'::text, 1, null::text) $$, 'the traveller sees what to pay');
select throws_ok($$ select public.attach_deposit_order((select id from ids where label = 'far'),
  'fa111111-1111-4111-8111-111111111111', 'order_Invented000001', 100001) $$,
  '42501', null, 'travellers cannot record orders through the API');
select throws_ok($$ insert into public.payments (booking_id, provider_id, amount_minor, razorpay_order_id, status, captured_at, razorpay_payment_id)
  values ((select id from ids where label = 'near'), 'fa000000-0000-4000-8000-000000000001', 100001, 'order_Forged00000001', 'captured', now(), 'pay_Forged000000001') $$,
  '42501', null, 'travellers cannot write payments directly');
select throws_ok($$ select public.record_razorpay_payment('order_FarOrder000001', 'pay_Forged000000001', 'captured', 100001, 'INR') $$,
  '42501', null, 'travellers cannot mark a payment captured');

-- The server records the orders it created (system path, checked against the traveller).
reset role;
set local role service_role;
select throws_ok($$ select public.attach_deposit_order((select id from ids where label = 'far'),
  'fa222222-2222-4222-8222-222222222222', 'order_OtherUser00001', 100001) $$,
  'P0002', null, 'an order is only attached for the booking''s own traveller');
select throws_ok($$ select public.attach_deposit_order((select id from ids where label = 'far'),
  'fa111111-1111-4111-8111-111111111111', 'order_FakeAmount0001', 5000) $$,
  '55000', null, 'an order for another amount is refused');
select public.attach_deposit_order(b.id, 'fa111111-1111-4111-8111-111111111111', o.order_id, 100001)
from ids b join (values ('far', 'order_FarOrder000001'), ('near', 'order_NearOrder00001'), ('partner', 'order_PartnerOrder01'),
  ('unpaid', 'order_UnpaidOrder001'), ('kept', 'order_KeptOrder00001'), ('grace', 'order_GraceOrder0001')) o(label, order_id)
  on o.label = b.label;
select lives_ok($$ select public.attach_deposit_order((select id from ids where label = 'near'),
  'fa111111-1111-4111-8111-111111111111', 'order_FarOrder000001', 100001) $$,
  'an order id already used elsewhere is ignored, not moved');
select is((select booking_id from public.payments where razorpay_order_id = 'order_FarOrder000001'),
  (select id from ids where label = 'far'), 'and stays with its booking');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"fa111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}', true);
select results_eq(
  $$ select attempt, reusable_order_id from public.deposit_checkout((select id from ids where label = 'far')) $$,
  $$ values (2, 'order_FarOrder000001'::text) $$, 'a retry within 30 minutes reuses the order');

-- System recording -----------------------------------------------------------------------------
reset role;
set local role service_role;
select is(public.record_razorpay_payment('order_FarOrder000001', 'pay_FarFailed0000001', 'failed', 100001, 'INR'), 'failed_attempt',
  'a failed attempt is noted');
select is((select status::text from public.payments where razorpay_order_id = 'order_FarOrder000001'), 'created',
  'and doesn''t close the order (Checkout can retry it)');
select throws_ok($$ select public.record_razorpay_payment('order_FarOrder000001', 'pay_FarPay000000001', 'captured', 1, 'INR') $$,
  '22023', null, 'a capture for another amount is refused');
select is(public.record_razorpay_payment('order_FarOrder000001', 'pay_FarPay000000001', 'captured', 100001, 'INR'), 'captured',
  'a matching capture marks the deposit paid');
select is(public.record_razorpay_payment('order_FarOrder000001', 'pay_FarPay000000001', 'captured', 100001, 'INR'), 'duplicate',
  'the same capture twice is a no-op');
select is(public.record_razorpay_payment('order_FarOrder000001', 'pay_FarSecond0000001', 'captured', 100001, 'INR'), 'extra_payment',
  'a second payment on a paid order is flagged for a person');
select is(public.record_razorpay_payment('order_Unknown0000001', 'pay_X0000000000001', 'captured', 100001, 'INR'), 'unknown_order',
  'unknown orders are reported, not created');
select is(public.record_razorpay_payment(o, replace(o, 'order_', 'pay_'), 'captured', 100001, 'INR'), 'captured')
from unnest(array['order_NearOrder00001', 'order_PartnerOrder01', 'order_KeptOrder00001']) o;
select is(public.log_payment_event('evt_1', 'payment.captured', '{"order_id":"order_FarOrder000001"}'), true, 'a new webhook event is logged');
select is(public.log_payment_event('evt_1', 'payment.captured', '{}'), false, 'a repeated delivery is recognised');
reset role;
update public.payment_events set received_at = now() - interval '5 minutes' where event_id = 'evt_1';
set local role service_role;
select is(public.log_payment_event('evt_1', 'payment.captured', '{}'), true,
  'an event whose processing never finished is taken again on retry');
select public.finish_payment_event('evt_1', 'captured');
reset role;
update public.payment_events set received_at = now() - interval '5 minutes' where event_id = 'evt_1';
set local role service_role;
select is(public.log_payment_event('evt_1', 'payment.captured', '{}'), false, 'a finished event is never processed twice');
reset role;
select isnt((select deposit_paid_at from public.bookings where id = (select id from ids where label = 'far')), null,
  'the booking shows the deposit as paid');

-- Who sees payments ----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"fa111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}', true);
select is((select count(*) from public.payments where status = 'captured'), 4::bigint, 'the traveller sees their payments');
select throws_ok($$ select razorpay_order_id from public.payments $$, '42501', null, 'Razorpay ids are not readable by API roles');
select set_config('request.jwt.claims', '{"sub":"fa222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal1"}', true);
select is((select count(*) from public.payments), 0::bigint, 'other travellers see none');
select set_config('request.jwt.claims', '{"sub":"fa333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal2"}', true);
select is((select count(*) from public.payments), 6::bigint, 'the partner sees their bookings'' payments');
select is_empty($$ select * from public.payment_events $$, 'partners cannot read the webhook log');

-- Refunds by cancellation timing ---------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"fa111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}', true);
select public.cancel_booking((select id from ids where label = 'far'), null);
select public.cancel_booking((select id from ids where label = 'near'), null);
select set_config('request.jwt.claims', '{"sub":"fa333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal2"}', true);
select public.cancel_booking((select id from ids where label = 'partner'), 'River in flood');
select results_eq(
  $$ select i.label, r.amount_minor, r.status::text from public.refunds r join ids i on i.id = r.booking_id order by i.label $$,
  $$ values ('far'::text, 100001::bigint, 'pending'::text), ('near', 50000, 'pending'), ('partner', 100001, 'pending') $$,
  'full refund 7+ days ahead, half inside 7 days, full when the partner cancels');

-- Unpaid deadline, with grace for a checkout in progress ---------------------------------------
reset role;
update public.bookings set payment_due_at = now() - interval '31 minutes' where id = (select id from ids where label = 'unpaid');
update public.bookings set payment_due_at = now() - interval '1 minute' where id = (select id from ids where label = 'grace');
select is(private.cancel_unpaid_bookings(), 1, 'one unpaid booking is past its deadline and grace period');
select results_eq(
  $$ select i.label, b.status::text, b.cancelled_by::text from public.bookings b join ids i on i.id = b.id
     where i.label in ('unpaid', 'grace') order by i.label $$,
  $$ values ('grace'::text, 'confirmed'::text, null::text), ('unpaid', 'cancelled', 'system') $$,
  'a checkout started just before the deadline gets more time; the other is cancelled by the system');
set local role service_role;
select is(public.record_razorpay_payment('order_UnpaidOrder001', 'pay_LatePay000000001', 'captured', 100001, 'INR'), 'refund_queued',
  'a payment arriving after cancellation is refunded in full');

-- Sending refunds: each is claimed once ----------------------------------------------------------
select is((select count(*) from public.claim_refunds(20)), 4::bigint, 'four refunds are claimed for sending');
select is((select count(*) from public.claim_refunds(20)), 0::bigint, 'a concurrent run can''t claim them again');
select is(public.record_razorpay_refund('submitted',
  p_refund_uuid => (select r.id from public.refunds r join ids i on i.id = r.booking_id where i.label = 'far'),
  p_razorpay_refund_id => 'rfnd_FarRefund000001'), 'submitted', 'a sent refund records Razorpay''s id');
select is(public.record_razorpay_refund('processed', p_razorpay_refund_id => 'rfnd_FarRefund000001', p_amount_minor => 1),
  'amount_mismatch', 'a refund webhook for another amount is refused');
select is(public.record_razorpay_refund('submitted',
  p_refund_uuid => (select r.id from public.refunds r join ids i on i.id = r.booking_id where i.label = 'far'),
  p_razorpay_refund_id => 'rfnd_FarSecond000001'), 'conflicting_refund', 'a second Razorpay refund for the same row is flagged');
select is(public.record_razorpay_refund('processed', p_razorpay_refund_id => 'rfnd_FarRefund000001', p_amount_minor => 100001),
  'processed', 'the refund webhook completes it');
select is(public.record_razorpay_refund('processed', p_razorpay_refund_id => 'rfnd_Manual000000001',
  p_razorpay_payment_id => 'pay_KeptOrder00001', p_amount_minor => 20000), 'recorded_manual_refund',
  'a refund made in the Razorpay Dashboard is recorded');
reset role;
select results_eq(
  $$ select refunded_minor from public.payments where razorpay_order_id in ('order_FarOrder000001', 'order_KeptOrder00001') order by razorpay_order_id $$,
  $$ values (100001::bigint), (20000::bigint) $$, 'payments show the refunded amounts');
update public.refunds set status = 'failed', claimed_until = null
where booking_id = (select id from ids where label = 'partner');

-- Partner balance and payouts ------------------------------------------------------------------
-- Settled (cancelled): far 1000.01 refunded; near 1000.01 - 500.00 pending; partner 1000.01 failed
-- (still owed to the traveller); unpaid 1000.01 pending refund -> payable 500.01.
-- Held: kept 1000.01 (confirmed, upcoming), of which 200.00 refunded by hand.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"fa333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal2"}', true);
select results_eq(
  $$ select collected_minor, refunded_minor, pending_refunds_minor, held_minor, paid_out_minor, owed_minor
     from public.partner_payment_summary('fa000000-0000-4000-8000-000000000001') $$,
  $$ values (500005::bigint, 120001::bigint, 250002::bigint, 100001::bigint, 0::bigint, 50001::bigint) $$,
  'deposits for upcoming trips are held; failed refunds still count against the partner');
select throws_ok($$ select * from public.partner_payment_summary('fa000000-0000-4000-8000-000000000002') $$, '42501', null,
  'not another partner''s balance');
select throws_ok($$ select public.record_partner_payout('fa000000-0000-4000-8000-000000000001', 1000, 'UTR1', '') $$, '42501', null,
  'partners cannot record payouts');
select set_config('request.jwt.claims', '{"sub":"fa555555-5555-4555-8555-555555555555","role":"authenticated","aal":"aal2"}', true);
select throws_ok($$ select public.record_partner_payout('fa000000-0000-4000-8000-000000000001', 50002, 'UTR1', '') $$, '22023', null,
  'a payout above what is payable (held deposits excluded) is refused');
select lives_ok($$ select public.record_partner_payout('fa000000-0000-4000-8000-000000000001', 30000, 'UTR123456', 'Bank transfer') $$,
  'the admin records a payout');
select throws_ok($$ select public.record_partner_payout('fa000000-0000-4000-8000-000000000001', 1000, 'UTR123456', '') $$, '23505', null,
  'the same bank reference can''t be recorded twice');
select results_eq($$ select owed_minor, paid_out_minor from public.admin_partner_balances() where provider_id = 'fa000000-0000-4000-8000-000000000001' $$,
  $$ values (20001::bigint, 30000::bigint) $$, 'what remains owed');

select * from finish();
rollback;
