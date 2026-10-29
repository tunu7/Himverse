-- Request limits (migration request_rate_limits, ADR-0011): only the server's
-- privileged path can count; counting is per bucket and key; refusals report
-- when to retry; windows expire; bad parameters are refused.
begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

insert into auth.users (id, email, aud, role)
values ('7a111111-1111-4111-8111-111111111111', 'rl.t@example.test', 'authenticated', 'authenticated');

-- Who can call it -----------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select * from public.hit_rate_limit('sign_in_email', repeat('a', 64), 5, 60) $$,
  '42501', null, 'anon cannot count (nobody can exhaust someone else''s budget from a browser)');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7a111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select throws_ok($$ select * from public.hit_rate_limit('sign_in_email', repeat('a', 64), 5, 60) $$,
  '42501', null, 'signed-in users cannot count either');
select throws_ok($$ select * from private.request_rate_limits $$, '42501', null, 'the counters are not readable by API roles');
reset role;

-- Counting ---------------------------------------------------------------------------------
set local role service_role;
select results_eq(
  $$ select allowed from public.hit_rate_limit('sign_in_email', repeat('a', 64), 2, 600) $$,
  $$ values (true) $$, 'the first request is allowed');
select results_eq(
  $$ select allowed from public.hit_rate_limit('sign_in_email', repeat('a', 64), 2, 600) $$,
  $$ values (true) $$, 'the second is allowed (limit 2)');
select results_eq(
  $$ select allowed, retry_after_seconds between 1 and 600 from public.hit_rate_limit('sign_in_email', repeat('a', 64), 2, 600) $$,
  $$ values (false, true) $$, 'the third is refused, with when to retry inside the window');
select results_eq(
  $$ select allowed from public.hit_rate_limit('sign_in_email', repeat('b', 64), 2, 600) $$,
  $$ values (true) $$, 'another key has its own budget');
select results_eq(
  $$ select allowed from public.hit_rate_limit('sign_up_ip', repeat('a', 64), 2, 600) $$,
  $$ values (true) $$, 'another bucket has its own budget');

-- Bad parameters ----------------------------------------------------------------------------
select throws_ok($$ select * from public.hit_rate_limit('Sign In!', repeat('a', 64), 2, 60) $$,
  '23514', null, 'bucket names are constrained');
select throws_ok($$ select * from public.hit_rate_limit('sign_in_email', 'person@example.test', 2, 60) $$,
  '23514', null, 'keys must be hashes, never raw identifiers');
select throws_ok($$ select * from public.hit_rate_limit('sign_in_email', repeat('a', 64), 0, 60) $$,
  '22023', null, 'a limit must be positive');
select throws_ok($$ select * from public.hit_rate_limit('sign_in_email', repeat('a', 64), 5, 90000) $$,
  '22023', null, 'windows are at most a day');

-- Expiry -------------------------------------------------------------------------------------
reset role;
select is(
  (select hits from private.request_rate_limits where bucket = 'sign_in_email' and key_hash = repeat('a', 64)),
  3, 'refused requests are counted too');
update private.request_rate_limits set window_start = now() - interval '3 days' where bucket = 'sign_up_ip';
select is(private.prune_request_rate_limits(), 1, 'expired windows are pruned');

select * from finish();
rollback;
