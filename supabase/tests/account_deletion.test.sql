-- Self-serve account deletion (migration account_deletion): open bookings are
-- cancelled, past ones are anonymised for partners, and the guards hold.
begin;
create extension if not exists pgtap with schema extensions;

select plan(24);

-- T: traveller with bookings   U: traveller with a trip tomorrow   P: sole partner of Pv
-- Q, Q2: partners sharing Qv   A: admin   M: traveller with an authenticator
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('d1111111-1111-4111-8111-111111111111', 'ad.t@example.test', 'authenticated', 'authenticated', '{"account_type":"traveller"}'),
  ('d2222222-2222-4222-8222-222222222222', 'ad.u@example.test', 'authenticated', 'authenticated', '{"account_type":"traveller"}'),
  ('d3333333-3333-4333-8333-333333333333', 'ad.p@example.test', 'authenticated', 'authenticated', '{"account_type":"partner"}'),
  ('d4444444-4444-4444-8444-444444444444', 'ad.q@example.test', 'authenticated', 'authenticated', '{"account_type":"partner"}'),
  ('d5555555-5555-4555-8555-555555555555', 'ad.q2@example.test', 'authenticated', 'authenticated', '{"account_type":"partner"}'),
  ('d6666666-6666-4666-8666-666666666666', 'ad.a@example.test', 'authenticated', 'authenticated', '{"account_type":"traveller"}'),
  ('d7777777-7777-4777-8777-777777777777', 'ad.m@example.test', 'authenticated', 'authenticated', '{"account_type":"traveller"}');
insert into public.user_roles (user_id, role) values ('d6666666-6666-4666-8666-666666666666', 'admin');
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (gen_random_uuid(), 'd7777777-7777-4777-8777-777777777777', 'phone', 'totp', 'verified', now(), now());
insert into public.providers (id, slug, display_name, status, verified_at) values
  ('ad000000-0000-4000-8000-000000000001', 'ad-pv', 'Pv', 'verified', now()),
  ('ad000000-0000-4000-8000-000000000002', 'ad-qv', 'Qv', 'verified', now());
insert into public.provider_members (provider_id, user_id) values
  ('ad000000-0000-4000-8000-000000000001', 'd3333333-3333-4333-8333-333333333333'),
  ('ad000000-0000-4000-8000-000000000002', 'd4444444-4444-4444-8444-444444444444'),
  ('ad000000-0000-4000-8000-000000000002', 'd5555555-5555-4555-8555-555555555555');
insert into public.destinations (id, slug, name, district, is_published)
values ('ad100000-0000-4000-8000-000000000001', 'ad-ziro', 'AD Ziro', 'Lower Subansiri', true);
insert into public.experiences (id, provider_id, destination_id, slug, title, category, duration_minutes, price_from_minor, status) values
  ('ad200000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001', 'ad100000-0000-4000-8000-000000000001', 'ad-walk', 'AD walk', 'culture', 120, null, 'published'),
  ('ad200000-0000-4000-8000-000000000002', 'ad000000-0000-4000-8000-000000000002', 'ad100000-0000-4000-8000-000000000001', 'ad-trek', 'AD trek', 'trekking', 120, 100000, 'published');
-- Published dates (instant booking). The walk has no price, so its bookings stay
-- requests for the partner; the priced trek is confirmed instantly.
insert into public.availability_slots (experience_id, starts_on, capacity) values
  ('ad200000-0000-4000-8000-000000000001', private.today_ist() + 20, 10),
  ('ad200000-0000-4000-8000-000000000001', private.today_ist() + 50, 10),
  ('ad200000-0000-4000-8000-000000000002', private.today_ist() + 25, 10),
  ('ad200000-0000-4000-8000-000000000002', private.today_ist() + 1, 10);

set local role authenticated;
create temp table ids (label text primary key, id uuid) on commit drop;

-- T books: one Pv request (open), one Qv trip confirmed instantly, one to cancel.
select set_config('request.jwt.claims', '{"sub":"d1111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}', true);
insert into ids select 'open', booking_id from public.request_booking_on_date('ad200000-0000-4000-8000-000000000001', private.today_ist() + 20, 2, 0, '+91 98765 43210', 'Veg', gen_random_uuid());
insert into ids select 'confirmed', booking_id from public.request_booking_on_date('ad200000-0000-4000-8000-000000000002', private.today_ist() + 25, 2, 0, '+91 98765 43210', 'Hi', gen_random_uuid());
-- U has a trip tomorrow, confirmed instantly.
select set_config('request.jwt.claims', '{"sub":"d2222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal1"}', true);
insert into ids select 'soon', booking_id from public.request_booking_on_date('ad200000-0000-4000-8000-000000000002', private.today_ist() + 1, 1, 0, '+91 98765 43211', '', gen_random_uuid());

-- T cancels one more request with a personal note, and adds a pickup address to the open one.
select set_config('request.jwt.claims', '{"sub":"d1111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}', true);
insert into ids select 'old', booking_id from public.request_booking_on_date('ad200000-0000-4000-8000-000000000001', private.today_ist() + 50, 1, 0, '+91 98765 43210', '', gen_random_uuid());
reset role;
update public.bookings set pickup_note = 'House 12, Hill Road' where id = (select id from ids where label = 'open');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d1111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}', true);
select public.cancel_booking((select id from ids where label = 'old'), 'My mother is unwell');

-- Guards ------------------------------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.delete_my_account() $$, '42501', null, 'anon cannot call it');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd6666666-6666-4666-8666-666666666666', 'role', 'authenticated', 'aal', 'aal2', 'amr', json_build_array(json_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint)))::text, true);
select throws_ok($$ select public.delete_my_account() $$, '42501',
  'admin accounts are removed by the platform owner', 'admins cannot delete themselves');

select set_config('request.jwt.claims', json_build_object('sub', 'd7777777-7777-4777-8777-777777777777', 'role', 'authenticated', 'aal', 'aal1', 'amr', json_build_array(json_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint)))::text, true);
select throws_ok($$ select public.delete_my_account() $$, '42501',
  'verify your two-step login first', 'an account with an authenticator needs the second step');

select set_config('request.jwt.claims', json_build_object('sub', 'd3333333-3333-4333-8333-333333333333', 'role', 'authenticated', 'aal', 'aal2', 'amr', json_build_array(json_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint)))::text, true);
select throws_ok($$ select public.delete_my_account() $$, '55000',
  'answer or cancel your business''s open bookings first', 'the last partner with open requests cannot leave');

select set_config('request.jwt.claims', json_build_object('sub', 'd2222222-2222-4222-8222-222222222222', 'role', 'authenticated', 'aal', 'aal1', 'amr', json_build_array(json_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint)))::text, true);
select throws_ok($$ select public.delete_my_account() $$, '55000', null,
  'a confirmed trip within 24 hours blocks deletion');
reset role;
select is((select status::text from public.bookings where id = (select id from ids where label = 'soon')), 'confirmed',
  'and nothing was changed');
set local role authenticated;

-- Partner with a co-member can leave; the business keeps its other member.
select set_config('request.jwt.claims', json_build_object('sub', 'd5555555-5555-4555-8555-555555555555', 'role', 'authenticated', 'aal', 'aal2', 'amr', json_build_array(json_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint)))::text, true);
select lives_ok($$ select public.delete_my_account() $$, 'a partner with a co-member can delete their account');
reset role;
select is((select count(*) from public.provider_members where provider_id = 'ad000000-0000-4000-8000-000000000002'), 1::bigint,
  'the business keeps its other member');

-- Traveller deletion -------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d1111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}', true);
select throws_ok($$ select public.delete_my_account() $$, '42501', 'sign in again to delete your account',
  'a token without sign-in times (e.g. stolen, calling the API directly) cannot delete');
select set_config('request.jwt.claims', json_build_object('sub', 'd1111111-1111-4111-8111-111111111111', 'role', 'authenticated', 'aal', 'aal1',
  'amr', json_build_array(json_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint - 3600)))::text, true);
select throws_ok($$ select public.delete_my_account() $$, '42501', 'sign in again to delete your account',
  'a sign-in an hour old is not enough');
select set_config('request.jwt.claims', json_build_object('sub', 'd1111111-1111-4111-8111-111111111111', 'role', 'authenticated', 'aal', 'aal1', 'amr', json_build_array(json_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint)))::text, true);
select lives_ok($$ select public.delete_my_account() $$, 'a traveller can delete their account');

reset role;
select is((select count(*) from auth.users where id = 'd1111111-1111-4111-8111-111111111111'), 0::bigint, 'the login is gone');
select is((select count(*) from public.profiles where id = 'd1111111-1111-4111-8111-111111111111'), 0::bigint, 'the profile is gone');
select results_eq(
  $$ select status::text, cancelled_by::text from public.bookings
     where id in (select id from ids where label in ('open', 'confirmed')) order by slot_starts_on $$,
  $$ values ('cancelled'::text, 'traveler'::text), ('cancelled', 'traveler') $$,
  'open and upcoming bookings were cancelled through the normal path');
select results_eq(
  $$ select traveler_id, traveler_name, contact_phone, traveler_note from public.bookings
     where id in (select id from ids where label in ('open', 'confirmed')) order by slot_starts_on $$,
  $$ values (null::uuid, 'Deleted traveller'::text, ''::text, ''::text), (null, 'Deleted traveller', '', '') $$,
  'bookings are kept for partners, without personal details');
select is((select count(*) from public.booking_events e where e.booking_id in (select id from ids)
           and e.to_status = 'cancelled' and e.note = 'The traveller deleted their account.'), 3::bigint,
  'partners see why');
select results_eq(
  $$ select pickup_note, cancellation_reason from public.bookings where id in (select id from ids where label in ('open', 'old')) order by slot_starts_on $$,
  $$ values (''::text, 'The traveller deleted their account.'::text), ('', 'The traveller deleted their account.') $$,
  'pickup details and the traveller''s own reasons are removed');
select is((select count(*) from public.booking_events where booking_id in (select id from ids)
           and actor_role = 'traveler' and note <> 'The traveller deleted their account.'), 0::bigint,
  'and so are their notes in the history');

-- The partner still sees the anonymised booking.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd4444444-4444-4444-8444-444444444444', 'role', 'authenticated', 'aal', 'aal2', 'amr', json_build_array(json_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint)))::text, true);
select results_eq(
  $$ select traveler_name from public.bookings where id = (select id from ids where label = 'confirmed') $$,
  $$ values ('Deleted traveller'::text) $$, 'the partner can still read the anonymised booking');

-- A sole partner with nothing open can leave; their business stops taking requests.
reset role;
update public.bookings set status = 'declined' where provider_id = 'ad000000-0000-4000-8000-000000000001' and status = 'requested';
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd3333333-3333-4333-8333-333333333333', 'role', 'authenticated', 'aal', 'aal2', 'amr', json_build_array(json_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint)))::text, true);
select lives_ok($$ select public.delete_my_account() $$, 'a sole partner with nothing open can delete their account');
reset role;
select is((select bool_or(accepts_bookings) from public.experiences where provider_id = 'ad000000-0000-4000-8000-000000000001'),
  false, 'a business left without members stops accepting bookings');

-- The owner deleting a user in the dashboard also anonymises their bookings.
delete from auth.users where id = 'd2222222-2222-4222-8222-222222222222';
select results_eq(
  $$ select traveler_name, contact_phone from public.bookings where id = (select id from ids where label = 'soon') $$,
  $$ values ('Deleted traveller'::text, ''::text) $$, 'deletion outside the app anonymises too');

reset role;
select throws_ok(
  $$ insert into public.bookings (reference, traveler_id, traveler_name, provider_id, experience_id, experience_title,
       slot_starts_on, adults, children, contact_phone, idempotency_key, request_expires_at)
     values ('HV-TEST', 'd7777777-7777-4777-8777-777777777777', 'X', 'ad000000-0000-4000-8000-000000000001',
       'ad200000-0000-4000-8000-000000000001', 'AD walk', private.today_ist() + 30, 1, 0, '', gen_random_uuid(),
       now() + interval '48 hours') $$,
  '23514', null, 'an empty phone is only allowed once the traveller is gone');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'delete_my_account'
             and has_function_privilege('anon', p.oid, 'execute')), 0::bigint,
  'anon has no execute privilege');

select * from finish();
rollback;
