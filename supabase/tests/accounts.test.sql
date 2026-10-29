-- One account type per account (migration 20261014215750_account_types, ADR-0007):
-- types come from sign-up or a one-time choice, are never writable through the
-- API, and the database refuses actions outside an account's type.
begin;
create extension if not exists pgtap with schema extensions;

select plan(28);

-- Fixtures: T traveller (email sign-up), P partner (email sign-up), G Google sign-up
-- (no type yet), S spoofed admin metadata, A admin (granted by the owner), U untyped.
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('a1111111-1111-4111-8111-111111111111', 'acct.traveller@example.test', 'authenticated', 'authenticated', '{"account_type":"traveller"}'),
  ('a2222222-2222-4222-8222-222222222222', 'acct.partner@example.test', 'authenticated', 'authenticated', '{"account_type":"partner"}'),
  ('a3333333-3333-4333-8333-333333333333', 'acct.google@example.test', 'authenticated', 'authenticated', '{"full_name":"G User","iss":"https://accounts.google.com"}'),
  ('a4444444-4444-4444-8444-444444444444', 'acct.spoof@example.test', 'authenticated', 'authenticated', '{"account_type":"admin"}'),
  ('a5555555-5555-4555-8555-555555555555', 'acct.admin@example.test', 'authenticated', 'authenticated', '{"account_type":"traveller"}'),
  ('a6666666-6666-4666-8666-666666666666', 'acct.untyped@example.test', 'authenticated', 'authenticated', '{}');
insert into public.user_roles (user_id, role) values ('a5555555-5555-4555-8555-555555555555', 'admin');

-- Creation ------------------------------------------------------------------------------
select results_eq(
  $$ select id::text, coalesce(account_type::text, 'none') from public.profiles
     where id::text like 'a%' and id in ('a1111111-1111-4111-8111-111111111111', 'a2222222-2222-4222-8222-222222222222',
       'a3333333-3333-4333-8333-333333333333', 'a4444444-4444-4444-8444-444444444444', 'a5555555-5555-4555-8555-555555555555')
     order by id $$,
  $$ values ('a1111111-1111-4111-8111-111111111111', 'traveller'), ('a2222222-2222-4222-8222-222222222222', 'partner'),
            ('a3333333-3333-4333-8333-333333333333', 'none'), ('a4444444-4444-4444-8444-444444444444', 'none'),
            ('a5555555-5555-4555-8555-555555555555', 'admin') $$,
  'sign-up sets traveller or partner, Google leaves it unset, admin metadata is ignored, the admin role makes an admin');

-- Nobody writes account_type directly ---------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}', true);
select throws_ok($$ update public.profiles set account_type = 'admin' where id = 'a1111111-1111-4111-8111-111111111111' $$,
  '42501', null, 'an account cannot change its own type');
select is(private.current_account_type(), 'traveller'::public.account_type, 'current_account_type reports the caller');
select throws_ok($$ select public.choose_account_type('partner') $$, '55000', null,
  'a traveller cannot switch to partner');

-- Choosing after Google sign-in ----------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a3333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal2"}', true);
select throws_ok($$ select public.choose_account_type('admin') $$, '22023', null, 'admin cannot be chosen');
select is(public.choose_account_type('partner'), 'partner'::public.account_type, 'a Google account chooses partner once');
select throws_ok($$ select public.choose_account_type('traveller') $$, '55000', null, 'the choice is final');
select is(public.choose_account_type('partner'), 'partner'::public.account_type, 'repeating the same choice is harmless');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.choose_account_type('traveller') $$, '42501', null, 'anon cannot choose');
reset role;

-- Catalogue fixture for bookings ------------------------------------------------------------
insert into public.providers (id, slug, display_name, status, verified_at)
values ('ac000000-0000-4000-8000-000000000001', 'acct-provider', 'Acct Provider', 'verified', now());
insert into public.provider_members (provider_id, user_id)
values ('ac000000-0000-4000-8000-000000000001', 'a2222222-2222-4222-8222-222222222222');
insert into public.destinations (id, slug, name, district, is_published)
values ('ad000000-0000-4000-8000-000000000001', 'acct-town', 'Acct Town', 'Tawang', true);
insert into public.experiences (id, provider_id, destination_id, slug, title, category, duration_minutes, price_from_minor, status)
values ('ae000000-0000-4000-8000-000000000001', 'ac000000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001',
  'acct-walk', 'Acct walk', 'culture', 60, 1000, 'published');
-- Experiences are booked on published dates (instant booking).
insert into public.availability_slots (experience_id, starts_on, capacity) values ('ae000000-0000-4000-8000-000000000001', private.today_ist() + 10, 10), ('ae000000-0000-4000-8000-000000000001', private.today_ist() + 11, 10);

select throws_ok(
  $$ insert into public.provider_members (provider_id, user_id) values ('ac000000-0000-4000-8000-000000000001', 'a1111111-1111-4111-8111-111111111111') $$,
  '42501', null, 'a traveller cannot be made a provider member, even by owner SQL');
select throws_ok(
  $$ insert into public.provider_members (provider_id, user_id) values ('ac000000-0000-4000-8000-000000000001', 'a5555555-5555-4555-8555-555555555555') $$,
  '42501', null, 'an admin cannot be made a provider member');

-- Each type stays in its lane --------------------------------------------------------------
set local role authenticated;
-- Admin
select set_config('request.jwt.claims', '{"sub":"a5555555-5555-4555-8555-555555555555","role":"authenticated","aal":"aal2"}', true);
select throws_ok(
  $$ select * from public.request_booking_on_date('ae000000-0000-4000-8000-000000000001', private.today_ist() + 10, 1, 0, '+91 98765 43210', '', gen_random_uuid()) $$,
  '42501', null, 'admins cannot book');
select throws_ok($$ select public.begin_itinerary_generation(null, 100) $$, '42501', null, 'admins cannot plan trips');
select throws_ok(
  $$ select public.create_provider_application('acct-admin-co', 'Admin Co', '', null, 'Admin Co', 'a@example.test', null) $$,
  '42501', null, 'admins cannot apply as a partner');
-- Partner
select set_config('request.jwt.claims', '{"sub":"a2222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal2"}', true);
select throws_ok(
  $$ select * from public.request_booking_on_date('ae000000-0000-4000-8000-000000000001', private.today_ist() + 10, 1, 0, '+91 98765 43210', '', gen_random_uuid()) $$,
  '42501', null, 'partners cannot book (not even their own listings)');
select throws_ok($$ select public.begin_itinerary_generation(null, 100) $$, '42501', null, 'partners cannot plan trips');
select ok(private.is_provider_member('ac000000-0000-4000-8000-000000000001'), 'a partner member holds provider authority');
-- Traveller
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}', true);
select throws_ok(
  $$ select public.create_provider_application('acct-trav-co', 'Trav Co', '', null, 'Trav Co', 'a@example.test', null) $$,
  '42501', null, 'travellers cannot apply as a partner');
select lives_ok(
  $$ select * from public.request_booking_on_date('ae000000-0000-4000-8000-000000000001', private.today_ist() + 10, 1, 0, '+91 98765 43210', '', gen_random_uuid()) $$,
  'travellers can book');

-- Admin and business never mix (security review B1/S1/S2) -----------------------------------
reset role;
insert into public.provider_members (provider_id, user_id)
values ('ac000000-0000-4000-8000-000000000001', 'a6666666-6666-4666-8666-666666666666');
select is((select account_type from public.profiles where id = 'a6666666-6666-4666-8666-666666666666'),
  'partner'::public.account_type, 'joining a provider makes an untyped account a partner');
select throws_ok(
  $$ insert into public.user_roles (user_id, role) values ('a6666666-6666-4666-8666-666666666666', 'admin') $$,
  '42501', null, 'a provider member cannot be granted admin until the membership is removed');

-- Simulate an admin who kept an old membership through the backfill.
alter table public.provider_members disable trigger provider_members_partner_only;
insert into public.provider_members (provider_id, user_id)
values ('ac000000-0000-4000-8000-000000000001', 'a5555555-5555-4555-8555-555555555555');
alter table public.provider_members enable trigger provider_members_partner_only;
update public.providers set status = 'pending_review' where id = 'ac000000-0000-4000-8000-000000000001';
insert into public.experiences (id, provider_id, destination_id, slug, title, category, duration_minutes, status, moderation_locked)
values ('ae000000-0000-4000-8000-000000000002', 'ac000000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001',
  'acct-locked', 'Acct locked', 'culture', 60, 'draft', true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a5555555-5555-4555-8555-555555555555","role":"authenticated","aal":"aal2"}', true);
select ok(not private.is_provider_member('ac000000-0000-4000-8000-000000000001'),
  'an admin holds no provider authority from an old membership');
select throws_ok(
  $$ select public.review_provider('ac000000-0000-4000-8000-000000000001', 'verified', null) $$,
  '42501', null, 'an admin still cannot verify a provider they belong to');
select throws_ok(
  $$ update public.experiences set status = 'published' where id = 'ae000000-0000-4000-8000-000000000002' $$,
  '42501', null, 'an admin cannot clear moderation on their own provider''s listing');
select throws_ok(
  $$ select public.submit_provider_application('ac000000-0000-4000-8000-000000000001') $$,
  'P0002', null, 'an admin cannot submit their old provider''s application');

reset role;
delete from public.user_roles where user_id = 'a5555555-5555-4555-8555-555555555555';
select is((select account_type from public.profiles where id = 'a5555555-5555-4555-8555-555555555555'),
  null, 'revoking admin leaves the account to choose again on /welcome');

-- Untyped accounts take the type of their first action ---------------------------------------
reset role;
update public.providers set status = 'verified' where id = 'ac000000-0000-4000-8000-000000000001';
insert into auth.users (id, email, aud, role, raw_user_meta_data)
values ('a7777777-7777-4777-8777-777777777777', 'acct.lazy@example.test', 'authenticated', 'authenticated', '{}');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a7777777-7777-4777-8777-777777777777","role":"authenticated","aal":"aal2"}', true);
select lives_ok(
  $$ select * from public.request_booking_on_date('ae000000-0000-4000-8000-000000000001', private.today_ist() + 11, 1, 0, '+91 98765 43210', '', gen_random_uuid()) $$,
  'an untyped account can book');
select is(private.current_account_type(), 'traveller'::public.account_type, '...and is now a traveller');

select * from finish();
rollback;
