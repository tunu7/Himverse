-- In-app booking alerts (migration booking_alerts).
begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

-- T, T2: travellers   P: partner of Pv   Q: partner of nothing
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('ba111111-1111-4111-8111-111111111111', 'ba.t@example.test', 'authenticated', 'authenticated', '{"account_type":"traveller"}'),
  ('ba222222-2222-4222-8222-222222222222', 'ba.t2@example.test', 'authenticated', 'authenticated', '{"account_type":"traveller"}'),
  ('ba333333-3333-4333-8333-333333333333', 'ba.p@example.test', 'authenticated', 'authenticated', '{"account_type":"partner"}'),
  ('ba444444-4444-4444-8444-444444444444', 'ba.q@example.test', 'authenticated', 'authenticated', '{"account_type":"partner"}');
insert into public.providers (id, slug, display_name, status, verified_at)
values ('ba000000-0000-4000-8000-000000000001', 'ba-pv', 'Pv', 'verified', now());
insert into public.provider_members (provider_id, user_id)
values ('ba000000-0000-4000-8000-000000000001', 'ba333333-3333-4333-8333-333333333333');
insert into public.destinations (id, slug, name, district, is_published)
values ('ba100000-0000-4000-8000-000000000001', 'ba-ziro', 'BA Ziro', 'Lower Subansiri', true);
insert into public.experiences (id, provider_id, destination_id, slug, title, category, duration_minutes, price_from_minor, status)
values ('ba200000-0000-4000-8000-000000000001', 'ba000000-0000-4000-8000-000000000001', 'ba100000-0000-4000-8000-000000000001',
  'ba-walk', 'BA walk', 'culture', 120, 100000, 'published');
-- Accounts last looked an hour ago, so this test's events count as new.
update public.profiles set bookings_seen_at = now() - interval '1 hour'
where id in ('ba111111-1111-4111-8111-111111111111', 'ba222222-2222-4222-8222-222222222222');

set local role authenticated;
create temp table ids (label text primary key, id uuid) on commit drop;
select set_config('request.jwt.claims', '{"sub":"ba111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}', true);
insert into ids select 'a', booking_id from public.request_booking_on_date('ba200000-0000-4000-8000-000000000001', private.today_ist() + 20, 2, 0, '+91 98765 43210', '', gen_random_uuid());
insert into ids select 'b', booking_id from public.request_booking_on_date('ba200000-0000-4000-8000-000000000001', private.today_ist() + 21, 2, 0, '+91 98765 43210', '', gen_random_uuid());
insert into ids select 'c', booking_id from public.request_booking_on_date('ba200000-0000-4000-8000-000000000001', private.today_ist() + 22, 2, 0, '+91 98765 43210', '', gen_random_uuid());
select public.cancel_booking((select id from ids where label = 'c'), null);

select is_empty($$ select * from public.my_booking_updates() $$,
  'the traveller''s own requests and cancellations are not updates');

-- Partner alerts: two open requests (c was cancelled); one is due within 12 hours.
reset role;
update public.bookings set request_expires_at = now() + interval '3 hours' where id = (select id from ids where label = 'b');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ba333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal2"}', true);
select results_eq($$ select needs_response, expiring_soon from public.partner_booking_alerts() $$,
  $$ values (2, 1) $$, 'the partner sees open requests and those expiring soon');
select set_config('request.jwt.claims', '{"sub":"ba333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal1"}', true);
select results_eq($$ select needs_response from public.partner_booking_alerts() $$,
  $$ values (0) $$, 'nothing before two-step login');
select set_config('request.jwt.claims', '{"sub":"ba444444-4444-4444-8444-444444444444","role":"authenticated","aal":"aal2"}', true);
select results_eq($$ select needs_response from public.partner_booking_alerts() $$,
  $$ values (0) $$, 'another partner sees nothing');

-- The partner confirms a; the traveller sees it as an update.
select set_config('request.jwt.claims', '{"sub":"ba333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal2"}', true);
select public.respond_to_booking((select id from ids where label = 'a'), 'confirmed', 200000, null);
select set_config('request.jwt.claims', '{"sub":"ba111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}', true);
select results_eq($$ select booking_id from public.my_booking_updates() $$,
  $$ select id from ids where label = 'a' $$, 'a partner reply is an update');
select set_config('request.jwt.claims', '{"sub":"ba222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal1"}', true);
select is_empty($$ select * from public.my_booking_updates() $$, 'other travellers see nothing');

-- Looking at bookings clears them.
select set_config('request.jwt.claims', '{"sub":"ba111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}', true);
select lives_ok($$ select public.mark_bookings_seen() $$, 'the traveller marks bookings as seen');
select is_empty($$ select * from public.my_booking_updates() $$, 'and no updates remain');

select throws_ok($$ update public.profiles set bookings_seen_at = now() + interval '1 year'
  where id = 'ba111111-1111-4111-8111-111111111111' $$, '42501', null,
  'the timestamp can''t be written directly');

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select * from public.partner_booking_alerts() $$, '42501', null, 'anon cannot read alerts');

select * from finish();
rollback;
