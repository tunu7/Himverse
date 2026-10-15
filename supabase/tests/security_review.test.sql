-- Regression tests for the Phase 1 security review findings (M1, M2, L1, L2)
-- and the coverage gaps it identified. Migration: 20261012133752_security_hardening.
begin;
create extension if not exists pgtap with schema extensions;

select plan(33);

-- Isolate from local seed data; rolled back with everything else.
truncate public.booking_events, public.bookings, public.availability_slots, public.itinerary_items, public.experiences, public.destinations, public.provider_status_events,
  public.provider_private_details, public.provider_members, public.providers;

-- Fixtures (as postgres) ------------------------------------------------------
-- O: owner of draft provider   P: owner of verified provider   T: traveler   A: admin
insert into auth.users (id, email, aud, role)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'owner.o@example.test', 'authenticated', 'authenticated'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'owner.p@example.test', 'authenticated', 'authenticated'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'traveler@example.test', 'authenticated', 'authenticated'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'admin@example.test', 'authenticated', 'authenticated');
insert into public.user_roles (user_id, role) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'admin');

insert into public.providers (id, slug, display_name, status, verified_at, created_by)
values
  ('10000000-0000-4000-8000-000000000001', 'o-provider', 'O Provider', 'draft', null, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('10000000-0000-4000-8000-000000000002', 'p-provider', 'P Provider', 'verified', now(), 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.provider_members (provider_id, user_id)
values
  ('10000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('10000000-0000-4000-8000-000000000002', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.provider_private_details (provider_id, legal_name, contact_email)
values
  ('10000000-0000-4000-8000-000000000001', 'O Legal', 'o@example.test'),
  ('10000000-0000-4000-8000-000000000002', 'P Legal', 'p@example.test');
insert into public.destinations (id, slug, name, district, is_published)
values
  ('20000000-0000-4000-8000-000000000001', 'ziro', 'Ziro Valley', 'Lower Subansiri', true),
  ('20000000-0000-4000-8000-000000000002', 'hidden', 'Hidden', 'Shi Yomi', false);
insert into public.experiences (id, provider_id, destination_id, slug, title, category, duration_minutes, status)
values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
   '20000000-0000-4000-8000-000000000001', 'p-walk', 'P walk', 'culture', 120, 'published');

-- RPC gaps: anonymous ----------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$ select public.submit_provider_application('10000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'anon cannot call submit_provider_application');
select throws_ok(
  $$ select public.review_provider('10000000-0000-4000-8000-000000000001', 'verified', null) $$,
  '42501', null, 'anon cannot call review_provider');
-- L2
select throws_ok(
  $$ select created_by from public.providers $$,
  '42501', null, 'anon cannot read providers.created_by');
select lives_ok(
  $$ select id, slug, display_name from public.providers $$,
  'anon can still read public provider columns');

-- Traveler T -----------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated","aal":"aal2"}', true);
select throws_ok(
  $$ select public.review_provider('10000000-0000-4000-8000-000000000001', 'verified', null) $$,
  '42501', null, 'traveler cannot call review_provider');
select throws_ok(
  $$ select created_by from public.experiences $$,
  '42501', null, 'signed-in users cannot read experiences.created_by');
select is_empty(
  $$ select 1 from public.provider_members $$,
  'traveler cannot see provider memberships');
-- L1
select throws_ok(
  $$ update public.profiles set display_name = 'Abc' || repeat(' ', 5000)
     where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' $$,
  '23514', null, 'whitespace-padded display_name is rejected');

-- Owner O: details editable only before review (M2) -------------------------------
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated","aal":"aal2"}', true);
select isnt_empty(
  $$ update public.provider_private_details set legal_name = 'O Legal Pvt Ltd'
     where provider_id = '10000000-0000-4000-8000-000000000001' returning 1 $$,
  'owner can edit private details while draft');
select is_empty(
  $$ update public.provider_private_details set legal_name = 'Hijack'
     where provider_id = '10000000-0000-4000-8000-000000000002' returning 1 $$,
  'owner cannot edit another provider''s private details');
select throws_ok(
  $$ update public.providers set display_name = 'O' || repeat(' ', 5000)
     where id = '10000000-0000-4000-8000-000000000001' $$,
  '23514', null, 'whitespace-padded provider name is rejected');
select throws_ok(
  $$ insert into public.experiences (provider_id, destination_id, slug, title, category, duration_minutes, created_by)
     values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
             'forged', 'Forged', 'other', 60, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') $$,
  '42501', null, 'created_by cannot be forged on insert');
select is(
  (select public.submit_provider_application('10000000-0000-4000-8000-000000000001')),
  'pending_review'::public.provider_status, 'owner submits');
select is_empty(
  $$ update public.provider_private_details set legal_name = 'Swapped After Submit'
     where provider_id = '10000000-0000-4000-8000-000000000001' returning 1 $$,
  'private details are frozen while pending review');
select is_empty(
  $$ update public.providers set display_name = 'Swapped Name'
     where id = '10000000-0000-4000-8000-000000000001' returning 1 $$,
  'public profile is frozen while pending review');

-- Admin A: RPC gaps ------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated","aal":"aal2"}', true);
select is(
  (select count(*) from public.provider_members),
  2::bigint, 'admin can read all memberships');
select throws_ok(
  $$ select public.review_provider('10000000-0000-4000-8000-000000000001', 'draft', null) $$,
  '55000', null, 'admin cannot move a provider back to draft');
select throws_ok(
  $$ select public.review_provider('10000000-0000-4000-8000-000000000001', 'rejected', repeat('x', 1001)) $$,
  '22023', null, 'review notes over 1000 characters are rejected');
select is(
  (select public.review_provider('10000000-0000-4000-8000-000000000001', 'rejected', 'Please add your registration number')),
  'rejected'::public.provider_status, 'admin requests changes');
select throws_ok(
  $$ select public.review_provider('10000000-0000-4000-8000-000000000002', 'suspended', null) $$,
  '22023', null, 'suspending requires a note');

-- Rejected -> owner edits -> resubmits
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated","aal":"aal2"}', true);
select isnt_empty(
  $$ update public.provider_private_details set legal_name = 'O Legal Pvt Ltd (Reg 123)'
     where provider_id = '10000000-0000-4000-8000-000000000001' returning 1 $$,
  'owner can correct details after rejection');
select is(
  (select public.submit_provider_application('10000000-0000-4000-8000-000000000001')),
  'pending_review'::public.provider_status, 'owner can resubmit after rejection');

-- Verified provider P: details frozen after verification (M2) -----------------------
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated","aal":"aal2"}', true);
select is_empty(
  $$ update public.provider_private_details set legal_name = 'Someone Else Entirely'
     where provider_id = '10000000-0000-4000-8000-000000000002' returning 1 $$,
  'verified provider cannot change its reviewed legal identity');
select throws_ok(
  $$ update public.experiences set destination_id = '20000000-0000-4000-8000-000000000002'
     where id = '30000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'cannot move a published experience to an unpublished destination');
select throws_ok(
  $$ update public.experiences set moderation_locked = false where id = '30000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'members cannot write moderation_locked directly');

-- M1: admin moderation sticks -------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated","aal":"aal2"}', true);
select lives_ok(
  $$ update public.experiences set status = 'archived' where id = '30000000-0000-4000-8000-000000000001' $$,
  'admin archives an experience');
select is(
  (select moderation_locked from public.experiences where id = '30000000-0000-4000-8000-000000000001'),
  true, 'admin unpublish/archive sets the moderation lock');
select throws_ok(
  $$ update public.experiences set status = 'published', destination_id = '20000000-0000-4000-8000-000000000002'
     where id = '30000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'admin cannot publish at an unpublished destination');

select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated","aal":"aal2"}', true);
select throws_ok(
  $$ update public.experiences set status = 'published' where id = '30000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'provider cannot republish an experience an admin archived');
select lives_ok(
  $$ update public.experiences set status = 'draft', title = 'P walk (revised)'
     where id = '30000000-0000-4000-8000-000000000001' $$,
  'provider can still revise a locked experience as a draft');

select set_config('request.jwt.claims', '{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated","aal":"aal2"}', true);
select lives_ok(
  $$ update public.experiences set status = 'published' where id = '30000000-0000-4000-8000-000000000001' $$,
  'admin can republish after review');
select is(
  (select moderation_locked from public.experiences where id = '30000000-0000-4000-8000-000000000001'),
  false, 'admin publishing clears the moderation lock');

-- Second review follow-ups (migration 20261012135457_review_followups) -------------
-- L-4: a suspended provider cannot edit its public profile.
reset role;
update public.providers set status = 'suspended' where id = '10000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated","aal":"aal2"}', true);
select is_empty(
  $$ update public.providers set display_name = 'Impersonated Brand'
     where id = '10000000-0000-4000-8000-000000000002' returning 1 $$,
  'suspended provider cannot edit its public profile');

reset role;

select * from finish();
rollback;
