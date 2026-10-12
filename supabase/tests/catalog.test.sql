-- RLS, privilege and publication tests for destinations and experiences (ADR-0002 §4–5).
begin;
create extension if not exists pgtap with schema extensions;

select plan(33);

-- Isolate from local seed data; rolled back with everything else.
truncate public.itinerary_items, public.experiences, public.destinations, public.provider_status_events,
  public.provider_private_details, public.provider_members, public.providers;

-- Fixtures (as postgres; fixtures may bypass the lifecycle functions) ----------
-- V: owner of verified provider   U: owner of draft provider   T: traveler   A: admin
insert into auth.users (id, email, aud, role)
values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'owner.v@example.test', 'authenticated', 'authenticated'),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'owner.u@example.test', 'authenticated', 'authenticated'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'traveler@example.test', 'authenticated', 'authenticated'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'admin@example.test', 'authenticated', 'authenticated');
insert into public.user_roles (user_id, role) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'admin');

insert into public.providers (id, slug, display_name, status, verified_at)
values
  ('10000000-0000-4000-8000-000000000001', 'v-provider', 'Verified Provider', 'verified', now()),
  ('10000000-0000-4000-8000-000000000002', 'u-provider', 'Unverified Provider', 'draft', null);
insert into public.provider_members (provider_id, user_id)
values
  ('10000000-0000-4000-8000-000000000001', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
  ('10000000-0000-4000-8000-000000000002', 'ffffffff-ffff-4fff-8fff-ffffffffffff');

insert into public.destinations (id, slug, name, district, is_published)
values
  ('20000000-0000-4000-8000-000000000001', 'ziro', 'Ziro Valley', 'Lower Subansiri', true),
  ('20000000-0000-4000-8000-000000000002', 'hidden-valley', 'Hidden Valley', 'Shi Yomi', false);

-- Destinations --------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select results_eq(
  $$ select slug from public.destinations $$,
  $$ values ('ziro') $$,
  'anon sees only published destinations'
);
select throws_ok(
  $$ insert into public.destinations (slug, name, district) values ('x-place', 'X', 'Tawang') $$,
  '42501', null,
  'anon cannot create destinations'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}', true);
select throws_ok(
  $$ insert into public.destinations (slug, name, district) values ('x-place', 'X', 'Tawang') $$,
  '42501', null,
  'traveler cannot create destinations'
);
select is_empty(
  $$ update public.destinations set is_published = true where slug = 'hidden-valley' returning id $$,
  'traveler cannot publish a destination'
);
select is_empty(
  $$ delete from public.destinations where slug = 'ziro' returning id $$,
  'traveler cannot delete destinations'
);

select set_config('request.jwt.claims', '{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}', true);
select lives_ok(
  $$ insert into public.destinations (slug, name, district, is_published) values ('dirang', 'Dirang', 'West Kameng', false) $$,
  'admin can create destinations'
);
select is(
  (select count(*) from public.destinations),
  3::bigint,
  'admin sees unpublished destinations'
);

-- Verified provider owner V -------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee","role":"authenticated"}', true);
select lives_ok(
  $$ insert into public.experiences (provider_id, destination_id, slug, title, category, duration_minutes)
     values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
             'v-draft-walk', 'Village walk (draft)', 'culture', 120) $$,
  'verified provider member creates a draft experience'
);
select lives_ok(
  $$ insert into public.experiences (provider_id, destination_id, slug, title, category, duration_minutes, price_from_minor, status)
     values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
             'v-live-trek', 'Ziro pine forest trek', 'trekking', 360, 150000, 'published') $$,
  'verified provider member publishes at a published destination'
);
select throws_ok(
  $$ insert into public.experiences (provider_id, destination_id, slug, title, category, duration_minutes, status)
     values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002',
             'v-hidden', 'Hidden trip', 'nature', 60, 'published') $$,
  '42501', null,
  'cannot publish at an unpublished destination'
);
select throws_ok(
  $$ insert into public.experiences (provider_id, destination_id, slug, title, category, duration_minutes)
     values ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001',
             'v-for-u', 'Not mine', 'nature', 60) $$,
  '42501', null,
  'cannot create experiences for another provider'
);
select throws_ok(
  $$ update public.experiences set provider_id = '10000000-0000-4000-8000-000000000002' where slug = 'v-draft-walk' $$,
  '42501', null,
  'cannot move an experience to another provider'
);
select throws_ok(
  $$ update public.experiences set published_at = now() - interval '1 year' where slug = 'v-live-trek' $$,
  '42501', null,
  'cannot forge published_at'
);
select throws_ok(
  $$ delete from public.experiences where slug = 'v-draft-walk' $$,
  '42501', null,
  'experiences cannot be deleted (archive instead)'
);

-- Unverified provider owner U -----------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"ffffffff-ffff-4fff-8fff-ffffffffffff","role":"authenticated"}', true);
select lives_ok(
  $$ insert into public.experiences (provider_id, destination_id, slug, title, category, duration_minutes)
     values ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001',
             'u-draft-tour', 'Monastery tour', 'culture', 180) $$,
  'unverified provider can prepare drafts'
);
select throws_ok(
  $$ insert into public.experiences (provider_id, destination_id, slug, title, category, duration_minutes, status)
     values ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001',
             'u-live', 'Too early', 'culture', 60, 'published') $$,
  '42501', null,
  'unverified provider cannot insert a published experience'
);
select throws_ok(
  $$ update public.experiences set status = 'published' where slug = 'u-draft-tour' $$,
  '42501', null,
  'unverified provider cannot publish an existing draft'
);
select is_empty(
  $$ select 1 from public.experiences where slug = 'v-draft-walk' $$,
  'another provider cannot see V''s drafts'
);
select is_empty(
  $$ update public.experiences set title = 'Hijacked' where slug = 'v-live-trek' returning id $$,
  'another provider cannot edit V''s experiences'
);

-- Public visibility -----------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select results_eq(
  $$ select slug from public.experiences $$,
  $$ values ('v-live-trek') $$,
  'anon sees only published experiences of verified providers at published destinations'
);
select throws_ok(
  $$ insert into public.experiences (provider_id, destination_id, slug, title, category, duration_minutes)
     values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'anon-x', 'Anon', 'other', 60) $$,
  '42501', null,
  'anon cannot create experiences'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}', true);
select results_eq(
  $$ select slug from public.experiences $$,
  $$ values ('v-live-trek') $$,
  'traveler sees the same public set as anon'
);
select isnt(
  (select published_at from public.experiences where slug = 'v-live-trek'),
  null,
  'published_at is set by the system when published'
);

-- Suspension hides everything and blocks publishing ------------------------------
select set_config('request.jwt.claims', '{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}', true);
select is(
  (select public.review_provider('10000000-0000-4000-8000-000000000001', 'suspended', 'Under investigation')),
  'suspended'::public.provider_status,
  'admin suspends provider V'
);
select throws_ok(
  $$ update public.experiences set status = 'published' where slug = 'u-draft-tour' $$,
  '42501', null,
  'admin cannot publish an unverified provider''s experience either'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is_empty(
  $$ select 1 from public.experiences $$,
  'suspended provider''s experiences disappear from public reads'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee","role":"authenticated"}', true);
select throws_ok(
  $$ update public.experiences set status = 'published' where slug = 'v-draft-walk' $$,
  '42501', null,
  'suspended provider cannot publish'
);
select throws_ok(
  $$ update public.experiences set title = 'Changed while suspended' where slug = 'v-live-trek' $$,
  '42501', null,
  'suspended provider cannot edit a published experience without unpublishing it'
);
select is(
  (select count(*) from public.experiences),
  2::bigint,
  'suspended provider still sees its own experiences'
);

-- Reinstatement restores visibility without republishing ---------------------------
select set_config('request.jwt.claims', '{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}', true);
select is(
  (select public.review_provider('10000000-0000-4000-8000-000000000001', 'verified', null)),
  'verified'::public.provider_status,
  'admin reinstates provider V'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select results_eq(
  $$ select slug from public.experiences $$,
  $$ values ('v-live-trek') $$,
  'reinstated provider''s published experience is visible again'
);

-- Unpublishing a destination hides its experiences -------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}', true);
select lives_ok(
  $$ update public.destinations set is_published = false where slug = 'ziro' $$,
  'admin unpublishes a destination'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is_empty(
  $$ select 1 from public.experiences $$,
  'experiences at an unpublished destination are hidden'
);

select * from finish();
rollback;
