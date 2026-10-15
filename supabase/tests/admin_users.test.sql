-- Admin users list (migration admin_users_list): admins with two-step login only,
-- read-only, searchable.
begin;
create extension if not exists pgtap with schema extensions;

select plan(6);

insert into auth.users (id, email, aud, role, raw_user_meta_data, email_confirmed_at) values
  ('c1111111-1111-4111-8111-111111111111', 'list.traveller@example.test', 'authenticated', 'authenticated', '{"account_type":"traveller","display_name":"Listed Traveller"}', now()),
  ('c2222222-2222-4222-8222-222222222222', 'list.partner@example.test', 'authenticated', 'authenticated', '{"account_type":"partner"}', null),
  ('c3333333-3333-4333-8333-333333333333', 'list.admin@example.test', 'authenticated', 'authenticated', '{"account_type":"traveller"}', now());
insert into public.user_roles (user_id, role) values ('c3333333-3333-4333-8333-333333333333', 'admin');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}', true);
select throws_ok($$ select * from public.admin_list_users() $$, '42501', null, 'travellers cannot list accounts');
select set_config('request.jwt.claims', '{"sub":"c3333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal1"}', true);
select throws_ok($$ select * from public.admin_list_users() $$, '42501', null, 'admins without two-step login cannot list accounts');

select set_config('request.jwt.claims', '{"sub":"c3333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal2"}', true);
select results_eq(
  $$ select email, display_name, account_type::text, email_confirmed from public.admin_list_users('list.traveller') $$,
  $$ values ('list.traveller@example.test'::text, 'Listed Traveller'::text, 'traveller'::text, true) $$,
  'admins search accounts by email');
select results_eq(
  $$ select email from public.admin_list_users('list.', 'partner') $$,
  $$ values ('list.partner@example.test'::text) $$,
  'and filter by account type');
select is((select count(*) from public.admin_list_users('%')), 0::bigint, 'search wildcards are matched literally');
reset role;
set local role anon;
select throws_ok($$ select * from public.admin_list_users() $$, '42501', null, 'anon cannot list accounts');

select * from finish();
rollback;
