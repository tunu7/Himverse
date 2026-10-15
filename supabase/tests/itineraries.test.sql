-- Itinerary persistence: ownership, immutability, grounding re-checks and
-- database-computed totals (ADR-0003, migration 20261012145550_itineraries).
begin;
create extension if not exists pgtap with schema extensions;

select plan(35);

truncate public.refunds, public.payments, public.partner_payouts, public.booking_events, public.bookings, public.availability_slots, public.itinerary_items, public.experiences, public.destinations, public.provider_status_events,
  public.provider_private_details, public.provider_members, public.providers;

-- Fixtures ----------------------------------------------------------------------
-- A: owner   B: another traveler
insert into auth.users (id, email, aud, role)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@example.test', 'authenticated', 'authenticated'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b@example.test', 'authenticated', 'authenticated');
insert into public.providers (id, slug, display_name, status, verified_at)
values
  ('10000000-0000-4000-8000-000000000001', 'verified-co', 'Verified Co', 'verified', now()),
  ('10000000-0000-4000-8000-000000000002', 'suspended-co', 'Suspended Co', 'suspended', now());
insert into public.destinations (id, slug, name, district, is_published)
values
  ('20000000-0000-4000-8000-000000000001', 'ziro', 'Ziro Valley', 'Lower Subansiri', true),
  ('20000000-0000-4000-8000-000000000002', 'hidden', 'Hidden Valley', 'Shi Yomi', false);
insert into public.experiences (id, provider_id, destination_id, slug, title, category, duration_minutes, price_from_minor, status)
values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'priced-walk', 'Priced walk', 'culture', 120, 100000, 'published'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'unpriced-picnic', 'Unpriced picnic', 'nature', 180, null, 'published'),
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'suspended-trip', 'Suspended trip', 'adventure', 120, 50000, 'published'),
  ('30000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'hidden-dest-trip', 'Hidden destination trip', 'nature', 120, 50000, 'published');

-- Helper SQL fragments are inlined; items are JSON arrays as the app sends them.
-- Anonymous ------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$ select * from public.save_itinerary_version(public.begin_itinerary_generation(null, null), null, 'Anon trip', 'generate', '{"adults":1}', '{}', 'itinerary.v1', 'itinerary-v1', 'mock', 1, '[]',
       '[{"day_number":1,"position":1,"experience_id":"30000000-0000-4000-8000-000000000001","destination_id":"20000000-0000-4000-8000-000000000001","time_of_day":"morning","rationale":""}]') $$,
  '42501', null, 'anon cannot save itineraries');
select throws_ok($$ select id from public.itineraries $$, '42501', null, 'anon cannot read itineraries');

-- Owner A saves a new itinerary ------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated","aal":"aal2"}', true);

select results_eq(
  $$ select version_number, estimated_total_minor, unpriced_item_count
     from public.save_itinerary_version(public.begin_itinerary_generation(null, null), null, 'Ziro weekend', 'generate', '{"durationDays":1,"adults":2}', '{"summary":"x"}',
       'itinerary.v1', 'itinerary-v1', 'mock', 2, '[]',
       '[{"day_number":1,"position":1,"experience_id":"30000000-0000-4000-8000-000000000001","destination_id":"20000000-0000-4000-8000-000000000001","time_of_day":"morning","rationale":"Walk","price_snapshot_minor":1},
         {"day_number":1,"position":2,"experience_id":"30000000-0000-4000-8000-000000000002","destination_id":"20000000-0000-4000-8000-000000000001","time_of_day":"afternoon","rationale":"Picnic"}]') $$,
  $$ values (1, 200000::bigint, 1) $$,
  'new itinerary: version 1, total = DB price x travelers, unpriced items counted');

reset role;
select set_config('test.itinerary', (select id::text from public.itineraries where title = 'Ziro weekend'), true);
select results_eq(
  $$ select experience_title_snapshot, price_snapshot_minor, duration_snapshot_minutes from public.itinerary_items order by position $$,
  $$ values ('Priced walk'::text, 100000, 120), ('Unpriced picnic'::text, null::integer, 180) $$,
  'item snapshots come from the database, not from the request');
set local role authenticated;

select results_eq(
  $$ select version_number from public.save_itinerary_version(public.begin_itinerary_generation(null, null), current_setting('test.itinerary')::uuid, 'ignored', 'refine', '{"adults":1}', '{}',
       'itinerary.v1', 'itinerary-v1', 'mock', 1, '[]',
       '[{"day_number":1,"position":1,"experience_id":"30000000-0000-4000-8000-000000000001","destination_id":"20000000-0000-4000-8000-000000000001","time_of_day":"full_day","rationale":""}]') $$,
  $$ values (2) $$,
  'saving again creates version 2');
select is(
  (select v.version_number from public.itineraries i join public.itinerary_versions v on v.id = i.current_version_id
   where i.id = current_setting('test.itinerary')::uuid),
  2, 'the new version becomes current');
select is((select count(*) from public.itinerary_versions), 2::bigint, 'owner reads own versions');
select is((select count(*) from public.itinerary_items), 3::bigint, 'owner reads own items');

-- Grounding re-checks -----------------------------------------------------------------
select throws_ok(
  $$ select * from public.save_itinerary_version(public.begin_itinerary_generation(null, null), current_setting('test.itinerary')::uuid, 'x', 'refine', '{"adults":1}', '{}', 'itinerary.v1', 'itinerary-v1', 'mock', 1, '[]',
       '[{"day_number":1,"position":1,"experience_id":"30000000-0000-4000-8000-000000000003","destination_id":"20000000-0000-4000-8000-000000000001","time_of_day":"morning","rationale":""}]') $$,
  '55000', null, 'suspended provider''s experience is rejected');
select throws_ok(
  $$ select * from public.save_itinerary_version(public.begin_itinerary_generation(null, null), current_setting('test.itinerary')::uuid, 'x', 'refine', '{"adults":1}', '{}', 'itinerary.v1', 'itinerary-v1', 'mock', 1, '[]',
       '[{"day_number":1,"position":1,"experience_id":"30000000-0000-4000-8000-000000000004","destination_id":"20000000-0000-4000-8000-000000000002","time_of_day":"morning","rationale":""}]') $$,
  '55000', null, 'experience at an unpublished destination is rejected');
select throws_ok(
  $$ select * from public.save_itinerary_version(public.begin_itinerary_generation(null, null), current_setting('test.itinerary')::uuid, 'x', 'refine', '{"adults":1}', '{}', 'itinerary.v1', 'itinerary-v1', 'mock', 1, '[]',
       '[{"day_number":1,"position":1,"experience_id":"30000000-0000-4000-8000-000000000001","destination_id":"20000000-0000-4000-8000-000000000002","time_of_day":"morning","rationale":""}]') $$,
  '55000', null, 'mismatched destination is rejected');
select throws_ok(
  $$ select * from public.save_itinerary_version(public.begin_itinerary_generation(null, null), current_setting('test.itinerary')::uuid, 'x', 'refine', '{"adults":1}', '{}', 'itinerary.v1', 'itinerary-v1', 'mock', 1, '[]',
       '[{"day_number":1,"position":1,"experience_id":"99999999-9999-4999-8999-999999999999","destination_id":"20000000-0000-4000-8000-000000000001","time_of_day":"morning","rationale":""}]') $$,
  '55000', null, 'nonexistent (e.g. hallucinated) experience id is rejected');
select throws_ok(
  $$ select * from public.save_itinerary_version(public.begin_itinerary_generation(null, null), current_setting('test.itinerary')::uuid, 'x', 'refine', '{"adults":1}', '{}', 'itinerary.v1', 'itinerary-v1', 'mock', 1, '[]', '[]') $$,
  '22023', null, 'empty item list is rejected');
select throws_ok(
  $$ select * from public.save_itinerary_version(public.begin_itinerary_generation(null, null), current_setting('test.itinerary')::uuid, 'x', 'refine', '{"adults":1}', '{}', 'itinerary.v1', 'itinerary-v1', 'mock', 0, '[]',
       '[{"day_number":1,"position":1,"experience_id":"30000000-0000-4000-8000-000000000001","destination_id":"20000000-0000-4000-8000-000000000001","time_of_day":"morning","rationale":""}]') $$,
  '22023', null, 'zero travelers is rejected');
select is((select count(*) from public.itinerary_versions), 2::bigint, 'rejected saves leave nothing behind');

-- Immutability and direct writes -------------------------------------------------------
select throws_ok(
  $$ insert into public.itinerary_versions (itinerary_id, version_number, kind, preferences, plan, schema_version, prompt_version, model, travelers, estimated_total_minor, unpriced_item_count)
     values (current_setting('test.itinerary')::uuid, 9, 'generate', '{"adults":1}', '{}', 'itinerary.v1', 'x', 'x', 1, 0, 0) $$,
  '42501', null, 'versions cannot be inserted directly');
select throws_ok(
  $$ insert into public.itinerary_items (version_id, day_number, position, experience_title_snapshot, destination_name_snapshot, time_of_day, duration_snapshot_minutes)
     select id, 1, 5, 'Forged', 'Forged', 'morning', 60 from public.itinerary_versions limit 1 $$,
  '42501', null, 'items cannot be inserted directly');
select throws_ok(
  $$ update public.itinerary_versions set estimated_total_minor = 0 $$,
  '42501', null, 'versions are immutable');
select throws_ok(
  $$ delete from public.itinerary_items $$,
  '42501', null, 'items cannot be deleted directly');
select throws_ok(
  $$ update public.itineraries set owner_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' $$,
  '42501', null, 'ownership cannot be transferred');
select lives_ok(
  $$ update public.itineraries set title = 'Ziro long weekend',
       current_version_id = (select id from public.itinerary_versions where version_number = 1)
     where id = current_setting('test.itinerary')::uuid $$,
  'owner can rename and restore an earlier version');

-- Generation log ---------------------------------------------------------------------
select lives_ok(
  $$ select public.finish_itinerary_generation(public.begin_itinerary_generation(current_setting('test.itinerary')::uuid, null), 'failed_validation', null, 'mock', 'itinerary-v1', 1200, 900, 400) $$,
  'owner can record a generation');

-- Another traveler B -------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated","aal":"aal2"}', true);
select is_empty($$ select 1 from public.itineraries $$, 'B cannot see A''s itineraries');
select is_empty($$ select 1 from public.itinerary_versions $$, 'B cannot see A''s versions');
select is_empty($$ select 1 from public.itinerary_items $$, 'B cannot see A''s items');
select is_empty($$ select 1 from public.itinerary_generations $$, 'B cannot see A''s generation log');
select throws_ok(
  $$ select * from public.save_itinerary_version(public.begin_itinerary_generation(null, null), current_setting('test.itinerary')::uuid, 'x', 'refine', '{"adults":1}', '{}', 'itinerary.v1', 'itinerary-v1', 'mock', 1, '[]',
       '[{"day_number":1,"position":1,"experience_id":"30000000-0000-4000-8000-000000000001","destination_id":"20000000-0000-4000-8000-000000000001","time_of_day":"morning","rationale":""}]') $$,
  'P0002', null, 'B cannot add versions to A''s itinerary (reported as not found)');
select is_empty(
  $$ update public.itineraries set title = 'Hijacked' where id = current_setting('test.itinerary')::uuid returning 1 $$,
  'B cannot rename A''s itinerary');
select is_empty(
  $$ delete from public.itineraries where id = current_setting('test.itinerary')::uuid returning 1 $$,
  'B cannot delete A''s itinerary');
select lives_ok(
  $$ select public.finish_itinerary_generation(public.begin_itinerary_generation(current_setting('test.itinerary')::uuid, null), 'failed_upstream', 'timeout', 'mock', 'itinerary-v1', 45000, 0, 0) $$,
  'B can log their own attempt');
reset role;
select is(
  (select itinerary_id from public.itinerary_generations where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  null::uuid, 'a log entry cannot be linked to someone else''s itinerary');

-- A cannot point current_version at B's version ---------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated","aal":"aal2"}', true);
select lives_ok(
  $$ select * from public.save_itinerary_version(public.begin_itinerary_generation(null, null), null, 'B trip', 'generate', '{"adults":1}', '{}', 'itinerary.v1', 'itinerary-v1', 'mock', 1, '[]',
       '[{"day_number":1,"position":1,"experience_id":"30000000-0000-4000-8000-000000000001","destination_id":"20000000-0000-4000-8000-000000000001","time_of_day":"morning","rationale":""}]') $$,
  'B saves their own itinerary');
reset role;
select set_config('test.b_version', (select v.id::text from public.itinerary_versions v join public.itineraries i on i.id = v.itinerary_id where i.title = 'B trip'), true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated","aal":"aal2"}', true);
select throws_ok(
  $$ update public.itineraries set current_version_id = current_setting('test.b_version')::uuid
     where id = current_setting('test.itinerary')::uuid;
     set constraints all immediate $$,
  '23503', null, 'current version must belong to the same itinerary');

-- Deleting cascades ----------------------------------------------------------------------
select lives_ok(
  $$ delete from public.itineraries where id = current_setting('test.itinerary')::uuid $$,
  'owner can delete their itinerary');
reset role;
select is(
  (select count(*) from public.itinerary_versions where itinerary_id = current_setting('test.itinerary')::uuid),
  0::bigint, 'deleting an itinerary removes its versions and items');

select * from finish();
rollback;
