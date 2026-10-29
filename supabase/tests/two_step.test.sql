-- Two-step login (migration 20261014221826_two_step_login): admin and provider
-- authority need an aal2 session; travellers are unaffected.
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('b1111111-1111-4111-8111-111111111111', 'mfa.traveller@example.test', 'authenticated', 'authenticated', '{"account_type":"traveller"}'),
  ('b2222222-2222-4222-8222-222222222222', 'mfa.partner@example.test', 'authenticated', 'authenticated', '{"account_type":"partner"}'),
  ('b3333333-3333-4333-8333-333333333333', 'mfa.admin@example.test', 'authenticated', 'authenticated', '{"account_type":"traveller"}');
insert into public.user_roles (user_id, role) values ('b3333333-3333-4333-8333-333333333333', 'admin');
insert into public.providers (id, slug, display_name, status, verified_at)
values ('bc000000-0000-4000-8000-000000000001', 'mfa-provider', 'MFA Provider', 'verified', now());
insert into public.provider_members (provider_id, user_id)
values ('bc000000-0000-4000-8000-000000000001', 'b2222222-2222-4222-8222-222222222222');
insert into public.destinations (id, slug, name, district, is_published)
values ('bd000000-0000-4000-8000-000000000001', 'mfa-town', 'MFA Town', 'Tawang', true);
insert into public.experiences (id, provider_id, destination_id, slug, title, category, duration_minutes, status)
values ('be000000-0000-4000-8000-000000000001', 'bc000000-0000-4000-8000-000000000001', 'bd000000-0000-4000-8000-000000000001',
  'mfa-walk', 'MFA walk', 'culture', 60, 'published');
-- Experiences are booked on published dates (instant booking).
insert into public.availability_slots (experience_id, starts_on, capacity) values ('be000000-0000-4000-8000-000000000001', private.today_ist() + 10, 10);

set local role authenticated;

-- Partner, password only (aal1)
select set_config('request.jwt.claims', '{"sub":"b2222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal1"}', true);
select ok(not private.is_provider_member('bc000000-0000-4000-8000-000000000001'), 'a partner without the second step holds no provider authority');
select is_empty(
  $$ update public.experiences set title = 'Hijacked' where id = 'be000000-0000-4000-8000-000000000001' returning 1 $$,
  'a partner without the second step cannot edit listings');
select throws_ok(
  $$ select public.create_provider_application('mfa-second', 'Second', '', null, 'Second', 's@example.test', null) $$,
  '42501', null, 'a partner without the second step cannot apply');
select is_empty(
  $$ update public.providers set display_name = 'Hijacked' where id = 'bc000000-0000-4000-8000-000000000001' returning 1 $$,
  'a partner without the second step cannot change the business profile');
select is_empty($$ select 1 from public.provider_private_details $$, 'a partner without the second step reads no private business details');
select set_config('request.jwt.claims', '{"sub":"b2222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select ok(not private.is_provider_member('bc000000-0000-4000-8000-000000000001'), 'a session with no aal claim counts as one step');
-- Partner, second step passed (aal2)
select set_config('request.jwt.claims', '{"sub":"b2222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal2"}', true);
select ok(private.is_provider_member('bc000000-0000-4000-8000-000000000001'), 'with the second step the partner has provider authority');

-- Admin, password only (aal1)
select set_config('request.jwt.claims', '{"sub":"b3333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal1"}', true);
select ok(not private.has_role('admin'), 'an admin without the second step has no admin role');
select is_empty($$ select 1 from public.provider_private_details $$, 'an admin without the second step reads no private business details');
select throws_ok(
  $$ select public.review_provider('bc000000-0000-4000-8000-000000000001', 'suspended', 'x') $$,
  '42501', null, 'an admin without the second step cannot review providers');
-- Admin, second step passed (aal2)
select set_config('request.jwt.claims', '{"sub":"b3333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal2"}', true);
select ok(private.has_role('admin'), 'with the second step the admin has the admin role');

-- Traveller, password only: unaffected
select set_config('request.jwt.claims', '{"sub":"b1111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}', true);
select lives_ok(
  $$ select * from public.request_booking_on_date('be000000-0000-4000-8000-000000000001', private.today_ist() + 10, 1, 0, '+91 98765 43210', '', gen_random_uuid()) $$,
  'travellers book without a second step');
select lives_ok($$ select public.begin_itinerary_generation(null, 100) $$, 'travellers plan trips without a second step');

-- Per-account attempt limits (auth_attempt_limits) -------------------------------------
select ok(public.auth_attempt_allowed('mfa_code'), 'attempts are allowed at first');
select lives_ok($$ select public.record_auth_failure('mfa_code') from generate_series(1, 5) $$, 'five failed codes are recorded');
select ok(not public.auth_attempt_allowed('mfa_code'), 'the sixth attempt within 15 minutes is refused');
select ok(public.auth_attempt_allowed('current_password'), 'limits are per kind');

select * from finish();
rollback;
