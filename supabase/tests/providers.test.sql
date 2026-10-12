-- RLS, privilege and lifecycle tests for providers (ADR-0002).
begin;
create extension if not exists pgtap with schema extensions;

select plan(37);

-- Isolate from local seed data; rolled back with everything else.
truncate public.booking_events, public.bookings, public.availability_slots, public.itinerary_items, public.experiences, public.destinations, public.provider_status_events,
  public.provider_private_details, public.provider_members, public.providers;

-- Fixtures (as postgres) ------------------------------------------------------
-- O: owner of "o-treks"   P: owner of "p-homestays"   T: traveler   A: admin
insert into auth.users (id, email, aud, role)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'owner.o@example.test', 'authenticated', 'authenticated'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'owner.p@example.test', 'authenticated', 'authenticated'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'traveler@example.test', 'authenticated', 'authenticated'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'admin@example.test', 'authenticated', 'authenticated');
insert into public.user_roles (user_id, role) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'admin');

-- Anonymous cannot apply --------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$ select public.create_provider_application('anon-co', 'Anon Co', '', null, 'Anon Co Pvt Ltd', 'a@example.test', null) $$,
  '42501', null,
  'anon cannot create a provider application'
);

-- Owner O applies -----------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);

select lives_ok(
  $$ select public.create_provider_application('o-treks', 'O Treks', 'Guided treks around Ziro', 'Lower Subansiri',
       'O Treks Private Limited', 'Owner.O@Example.test', '+91 98765 43210') $$,
  'authenticated user can create a provider application'
);

reset role;
select set_config('test.o_id', (select id::text from public.providers where slug = 'o-treks'), true);
select is(
  (select status from public.providers where slug = 'o-treks'),
  'draft'::public.provider_status,
  'new application starts as draft'
);
select is(
  (select contact_email from public.provider_private_details where provider_id = current_setting('test.o_id')::uuid),
  'owner.o@example.test',
  'contact email is normalised to lower case'
);
set local role authenticated;

select results_eq(
  $$ select slug from public.providers $$,
  $$ values ('o-treks') $$,
  'owner sees own draft provider'
);
select is(
  (select count(*) from public.provider_private_details),
  1::bigint,
  'owner reads own private details'
);
select lives_ok(
  $$ update public.providers set description = 'Guided treks around Ziro valley' where id = current_setting('test.o_id')::uuid $$,
  'owner can update descriptive fields'
);
select throws_ok(
  $$ update public.providers set status = 'verified' where id = current_setting('test.o_id')::uuid $$,
  '42501', null,
  'owner cannot set status directly'
);
select throws_ok(
  $$ update public.providers set verified_at = now() where id = current_setting('test.o_id')::uuid $$,
  '42501', null,
  'owner cannot set verified_at directly'
);
select throws_ok(
  $$ update public.providers set slug = 'renamed' where id = current_setting('test.o_id')::uuid $$,
  '42501', null,
  'owner cannot change slug'
);
select throws_ok(
  $$ insert into public.providers (slug, display_name, status) values ('sneaky', 'Sneaky', 'verified') $$,
  '42501', null,
  'cannot insert providers directly (bypassing the application function)'
);
select throws_ok(
  $$ insert into public.provider_status_events (provider_id, to_status) values (current_setting('test.o_id')::uuid, 'verified') $$,
  '42501', null,
  'cannot forge status events'
);
select throws_ok(
  $$ select public.review_provider(current_setting('test.o_id')::uuid, 'verified', null) $$,
  '42501', null,
  'owner cannot review (verify) their own provider'
);
select is(
  (select public.submit_provider_application(current_setting('test.o_id')::uuid)),
  'pending_review'::public.provider_status,
  'owner can submit draft for review'
);
select throws_ok(
  $$ select public.submit_provider_application(current_setting('test.o_id')::uuid) $$,
  '55000', null,
  'cannot resubmit while pending review'
);

-- Owner P has a separate provider -----------------------------------------------
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select lives_ok(
  $$ select public.create_provider_application('p-homestays', 'P Homestays', '', 'Tawang', 'P Homestays LLP', 'p@example.test', null) $$,
  'second owner creates their own application'
);
select throws_ok(
  $$ insert into public.provider_members (provider_id, user_id) values (current_setting('test.o_id')::uuid, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') $$,
  '42501', null,
  'cannot add yourself as a member of another provider'
);
select is_empty(
  $$ select 1 from public.provider_private_details where provider_id = current_setting('test.o_id')::uuid $$,
  'other provider owner cannot read O''s private details'
);
select is_empty(
  $$ select 1 from public.provider_status_events where provider_id = current_setting('test.o_id')::uuid $$,
  'other provider owner cannot read O''s status events'
);

-- Traveler T --------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}', true);
select is_empty(
  $$ select 1 from public.providers $$,
  'traveler cannot see unverified providers'
);
select is_empty(
  $$ update public.providers set display_name = 'Hijacked' where id = current_setting('test.o_id')::uuid returning id $$,
  'traveler cannot update someone else''s provider'
);
select throws_ok(
  $$ select public.submit_provider_application(current_setting('test.o_id')::uuid) $$,
  'P0002', null,
  'traveler cannot submit someone else''s application (reported as not found)'
);

-- Admin A -----------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}', true);
select is(
  (select count(*) from public.provider_private_details),
  2::bigint,
  'admin can read all private details'
);
select throws_ok(
  $$ update public.providers set status = 'verified' where id = current_setting('test.o_id')::uuid $$,
  '42501', null,
  'admin cannot set status directly either'
);
select throws_ok(
  $$ select public.review_provider(current_setting('test.o_id')::uuid, 'rejected', '  ') $$,
  '22023', null,
  'rejecting requires a note'
);
select is(
  (select public.review_provider(current_setting('test.o_id')::uuid, 'verified', null)),
  'verified'::public.provider_status,
  'admin verifies a pending provider'
);
select throws_ok(
  $$ select public.review_provider(current_setting('test.o_id')::uuid, 'rejected', 'late change') $$,
  '55000', null,
  'invalid transition verified -> rejected is refused'
);
-- actor_id is not selectable by API roles (security review L2); read the audit trail as the owner.
select throws_ok(
  $$ select actor_id from public.provider_status_events $$,
  '42501', null,
  'API roles cannot read actor ids from the audit trail'
);
reset role;
select results_eq(
  $$ select from_status::text, to_status::text, actor_id from public.provider_status_events
     where provider_id = current_setting('test.o_id')::uuid order by id $$,
  $$ values (null::text, 'draft'::text, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid),
            ('draft', 'pending_review', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid),
            ('pending_review', 'verified', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid) $$,
  'every status change is recorded with its actor'
);
set local role authenticated;

-- Public visibility follows status ------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select results_eq(
  $$ select slug from public.providers $$,
  $$ values ('o-treks') $$,
  'anon sees only the verified provider'
);
select throws_ok(
  $$ select legal_name from public.provider_private_details $$,
  '42501', null,
  'anon has no access to private details'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}', true);
select is(
  (select public.review_provider(current_setting('test.o_id')::uuid, 'suspended', 'Safety complaint under investigation')),
  'suspended'::public.provider_status,
  'admin can suspend a verified provider'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is_empty(
  $$ select 1 from public.providers $$,
  'suspended provider disappears from public reads immediately'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select is(
  (select status from public.providers where id = current_setting('test.o_id')::uuid),
  'suspended'::public.provider_status,
  'owner can still see their suspended provider'
);
select throws_ok(
  $$ select public.submit_provider_application(current_setting('test.o_id')::uuid) $$,
  '55000', null,
  'suspended provider cannot resubmit to get re-verified'
);

-- Admin who is also a provider member cannot review their own provider ----------
select set_config('request.jwt.claims', '{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}', true);
select lives_ok(
  $$ select public.submit_provider_application(public.create_provider_application('a-tours', 'A Tours', '', null, 'A Tours', 'admin@example.test', null)) $$,
  'admin can apply as a provider like anyone else'
);
select throws_ok(
  $$ select public.review_provider((select id from public.providers where slug = 'a-tours'), 'verified', null) $$,
  '42501', null,
  'admin cannot verify a provider they belong to'
);

select * from finish();
rollback;
