-- RLS and privilege tests for profiles and user_roles (ADR-0002).
-- Runs as postgres, switches to anon/authenticated with JWT claims to
-- impersonate users. Everything is rolled back.
begin;
create extension if not exists pgtap with schema extensions;

select plan(18);

-- Fixtures (as postgres) ------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data, aud, role)
values
  ('11111111-1111-4111-8111-111111111111', 'traveler.a@example.test', '{"display_name":"Asha"}', 'authenticated', 'authenticated'),
  ('22222222-2222-4222-8222-222222222222', 'traveler.b@example.test', '{"role":"admin","display_name":""}', 'authenticated', 'authenticated'),
  ('33333333-3333-4333-8333-333333333333', 'admin@example.test', '{}', 'authenticated', 'authenticated');

insert into public.user_roles (user_id, role)
values ('33333333-3333-4333-8333-333333333333', 'admin');

-- Trigger behaviour -----------------------------------------------------------
select is(
  (select display_name from public.profiles where id = '11111111-1111-4111-8111-111111111111'),
  'Asha',
  'profile is created from signup display_name'
);
select is(
  (select display_name from public.profiles where id = '22222222-2222-4222-8222-222222222222'),
  'traveler.b',
  'blank display_name falls back to email local part'
);
select is(
  (select count(*) from public.user_roles where user_id = '22222222-2222-4222-8222-222222222222'),
  0::bigint,
  'role in signup metadata does not grant a role'
);

-- Anonymous -------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$ select id from public.profiles $$,
  '42501', null,
  'anon cannot read profiles'
);
select throws_ok(
  $$ select user_id from public.user_roles $$,
  '42501', null,
  'anon cannot read user_roles'
);

-- Traveler A ------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

select results_eq(
  $$ select id from public.profiles $$,
  $$ values ('11111111-1111-4111-8111-111111111111'::uuid) $$,
  'traveler sees only their own profile'
);

select lives_ok(
  $$ update public.profiles set display_name = 'Asha T' where id = '11111111-1111-4111-8111-111111111111' $$,
  'traveler can update own display_name'
);

select is_empty(
  $$ update public.profiles set display_name = 'hijacked'
     where id = '22222222-2222-4222-8222-222222222222' returning id $$,
  'traveler cannot update another user''s profile'
);

select throws_ok(
  $$ update public.profiles set id = '22222222-2222-4222-8222-222222222222'
     where id = '11111111-1111-4111-8111-111111111111' $$,
  '42501', null,
  'traveler cannot change profile id (no column grant)'
);

select throws_ok(
  $$ insert into public.profiles (id, display_name) values ('22222222-2222-4222-8222-222222222222', 'x') $$,
  '42501', null,
  'traveler cannot insert profiles'
);

select throws_ok(
  $$ delete from public.profiles where id = '11111111-1111-4111-8111-111111111111' $$,
  '42501', null,
  'traveler cannot delete profiles'
);

select is_empty(
  $$ select user_id from public.user_roles $$,
  'traveler has no roles and cannot see others'' roles'
);

select throws_ok(
  $$ insert into public.user_roles (user_id, role) values ('11111111-1111-4111-8111-111111111111', 'admin') $$,
  '42501', null,
  'traveler cannot grant themselves admin'
);

select throws_ok(
  $$ update public.user_roles set user_id = '11111111-1111-4111-8111-111111111111' $$,
  '42501', null,
  'traveler cannot reassign an existing role'
);

select is(
  (select private.has_role('admin')),
  false,
  'has_role(admin) is false for a traveler'
);

-- Admin -----------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);

select is(
  (select count(*) from public.profiles),
  3::bigint,
  'admin can read all profiles'
);

select throws_ok(
  $$ insert into public.user_roles (user_id, role) values ('11111111-1111-4111-8111-111111111111', 'admin') $$,
  '42501', null,
  'even an admin cannot grant roles through the API'
);

-- Revocation takes effect immediately -----------------------------------------
reset role;
delete from public.user_roles where user_id = '33333333-3333-4333-8333-333333333333';
set local role authenticated;

select is(
  (select count(*) from public.profiles),
  1::bigint,
  'revoked admin immediately loses admin read access'
);

select * from finish();
rollback;
