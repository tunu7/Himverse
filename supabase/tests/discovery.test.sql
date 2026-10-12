-- Phase 2 discovery: full-text search, filters and counts must never surface
-- hidden inventory to anonymous visitors (draft destinations, unpublished or
-- draft experiences, unverified or suspended providers).
begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

truncate public.booking_events, public.bookings, public.availability_slots, public.itinerary_items, public.experiences, public.destinations, public.provider_status_events,
  public.provider_private_details, public.provider_members, public.providers;

-- Fixtures: every experience mentions "rafting" so search alone can't hide anything.
insert into public.providers (id, slug, display_name, status, verified_at)
values
  ('10000000-0000-4000-8000-000000000001', 'verified-co', 'Verified Co', 'verified', now()),
  ('10000000-0000-4000-8000-000000000002', 'suspended-co', 'Suspended Co', 'suspended', now()),
  ('10000000-0000-4000-8000-000000000003', 'draft-co', 'Draft Co', 'draft', null);
insert into public.destinations (id, slug, name, district, summary, is_published)
values
  ('20000000-0000-4000-8000-000000000001', 'river-town', 'River Town', 'East Siang', 'Rafting town', true),
  ('20000000-0000-4000-8000-000000000002', 'secret-valley', 'Secret Valley', 'Dibang Valley', 'Rafting valley', false);
insert into public.experiences (provider_id, destination_id, slug, title, category, duration_minutes, price_from_minor, status)
values
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'public-raft', 'Public rafting', 'adventure', 300, 200000, 'published'),
  ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'suspended-raft', 'Suspended rafting', 'adventure', 300, 200000, 'published'),
  ('10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'unverified-raft', 'Unverified rafting', 'adventure', 300, 200000, 'published'),
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'draft-dest-raft', 'Hidden valley rafting', 'adventure', 300, 200000, 'published'),
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'draft-raft', 'Draft rafting', 'adventure', 300, 200000, 'draft'),
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'archived-raft', 'Archived rafting', 'adventure', 300, 200000, 'archived');

-- Generated columns are populated --------------------------------------------------
select ok(
  (select search_vector @@ websearch_to_tsquery('english', 'rafts') from public.experiences where slug = 'public-raft'),
  'experience search vector is generated with English stemming');
select ok(
  (select search_vector @@ websearch_to_tsquery('english', 'east siang') from public.destinations where slug = 'river-town'),
  'destination search vector includes the district');

-- Anonymous visitors --------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select results_eq(
  $$ select slug from public.experiences
     where search_vector @@ websearch_to_tsquery('english', 'rafting') order by slug $$,
  $$ values ('public-raft') $$,
  'experience search returns only public inventory');
select results_eq(
  $$ select slug from public.destinations
     where search_vector @@ websearch_to_tsquery('english', 'rafting') order by slug $$,
  $$ values ('river-town') $$,
  'destination search returns only published destinations');
select results_eq(
  $$ select e.slug from public.experiences e
     join public.destinations d on d.id = e.destination_id
     where d.district = 'Dibang Valley' $$,
  $$ select null::text where false $$,
  'district filter cannot reach experiences at a draft destination');
select results_eq(
  $$ select e.slug from public.experiences e
     where e.category = 'adventure' and e.price_from_minor between 100000 and 300000
       and e.duration_minutes between 180 and 359 order by slug $$,
  $$ values ('public-raft') $$,
  'combined category, budget and duration filters return only public inventory');
select is(
  (select (select count(*) from public.experiences e where e.destination_id = d.id)
   from public.destinations d where d.slug = 'river-town'),
  1::bigint,
  'per-destination experience counts exclude hidden inventory');
select is_empty(
  $$ select 1 from public.experiences where slug in ('suspended-raft', 'unverified-raft', 'draft-dest-raft', 'draft-raft', 'archived-raft') $$,
  'hidden experiences cannot be fetched by slug');
select is_empty(
  $$ select 1 from public.destinations where slug = 'secret-valley' $$,
  'draft destination cannot be fetched by slug');
select is_empty(
  $$ select 1 from public.providers where slug in ('suspended-co', 'draft-co') $$,
  'suspended and unverified providers are not readable');
select lives_ok(
  $$ select search_vector from public.experiences limit 1 $$,
  'anon may read the search column it filters on');

-- Signed-in travelers see the same public set ------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}', true);
select results_eq(
  $$ select slug from public.experiences
     where search_vector @@ websearch_to_tsquery('english', 'rafting') order by slug $$,
  $$ values ('public-raft') $$,
  'signed-in non-members get the same public search results');

select * from finish();
rollback;
