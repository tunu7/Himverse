-- LOCAL DEVELOPMENT SEED ONLY. Runs on `npx supabase db reset` against the
-- local Docker database. Never run against staging or production.
--
-- Every record is labelled "(sample)" or "(local seed)": this is test data for
-- discovery, search and visibility rules, not real inventory.
--
-- Does NOT create users or admins (see the admin bootstrap runbook in
-- docs/security/SECURITY.md). The sample providers have no members.
--
-- Deliberately hidden records (must never be discoverable anonymously):
--   * destinations mechuka, anini            -> not published
--   * provider demo-draft-provider           -> draft (unverified)
--   * provider demo-suspended-provider       -> suspended
--   * experience demo-ziro-night-sky          -> draft experience
-- E2E tests in tests/e2e/discovery.spec.ts rely on these records.

insert into public.destinations (id, slug, name, district, summary, description, is_published)
values
  ('5eed0000-0000-4000-8000-000000000001', 'tawang', 'Tawang', 'Tawang',
   'High-altitude monastery town near the Sela Pass.',
   'Sample destination for local development. Monasteries, high passes and lakes.', true),
  ('5eed0000-0000-4000-8000-000000000002', 'ziro', 'Ziro Valley', 'Lower Subansiri',
   'Pine-ringed valley known for Apatani villages and rice fields.',
   'Sample destination for local development. Villages, pine forests and paddy fields.', true),
  ('5eed0000-0000-4000-8000-000000000003', 'dirang', 'Dirang', 'West Kameng',
   'River valley with hot springs and orchards.',
   'Sample destination for local development. Hot springs, orchards and birding.', true),
  ('5eed0000-0000-4000-8000-000000000004', 'mechuka', 'Mechuka', 'Shi Yomi',
   'Remote valley close to the border; draft content, not yet published.', '', false),
  ('5eed0000-0000-4000-8000-000000000005', 'bomdila', 'Bomdila', 'West Kameng',
   'Hill town with monasteries and apple orchards.',
   'Sample destination for local development. Markets, monasteries and ridge walks.', true),
  ('5eed0000-0000-4000-8000-000000000006', 'pasighat', 'Pasighat', 'East Siang',
   'Riverside town on the Siang.',
   'Sample destination for local development. River journeys and Adi villages.', true),
  ('5eed0000-0000-4000-8000-000000000007', 'namdapha', 'Namdapha', 'Changlang',
   'Rainforest national park in the far east.',
   'Sample destination for local development. Jungle walks and camping.', true),
  ('5eed0000-0000-4000-8000-000000000008', 'anini', 'Anini (draft)', 'Dibang Valley',
   'Draft destination, not yet published.', '', false);

insert into public.providers (id, slug, display_name, description, district, status, verified_at)
values
  ('5eed0000-0000-4000-8000-0000000000a1', 'demo-local-provider', 'Demo Provider (local seed)',
   'Sample data for local development.', 'Lower Subansiri', 'verified', now()),
  ('5eed0000-0000-4000-8000-0000000000a2', 'demo-draft-provider', 'Draft Provider (local seed)',
   'Unverified sample provider; must never appear publicly.', 'Tawang', 'draft', null),
  ('5eed0000-0000-4000-8000-0000000000a3', 'demo-suspended-provider', 'Suspended Provider (local seed)',
   'Suspended sample provider; its inventory must never appear publicly.', 'East Siang', 'suspended', now()),
  ('5eed0000-0000-4000-8000-0000000000a4', 'demo-valley-guides', 'Valley Guides (local seed)',
   'Second verified sample provider.', 'West Kameng', 'verified', now());

-- Visible (published, verified provider, published destination): 17 experiences,
-- enough for two pages at 12 per page.
insert into public.experiences
  (provider_id, destination_id, slug, title, summary, category, duration_minutes, price_from_minor, status)
values
  ('5eed0000-0000-4000-8000-0000000000a1', '5eed0000-0000-4000-8000-000000000002', 'demo-ziro-village-walk',
   'Apatani village walk (sample)', 'Sample experience for local development.', 'culture', 180, 120000, 'published'),
  ('5eed0000-0000-4000-8000-0000000000a1', '5eed0000-0000-4000-8000-000000000003', 'demo-dirang-hot-springs',
   'Dirang hot springs half day (sample)', 'Sample experience for local development.', 'wellness', 240, null, 'published'),
  ('5eed0000-0000-4000-8000-0000000000a4', '5eed0000-0000-4000-8000-000000000001', 'demo-tawang-monastery-morning',
   'Tawang monastery morning (sample)', 'Sample: early prayers at the monastery.', 'culture', 150, 50000, 'published'),
  ('5eed0000-0000-4000-8000-0000000000a4', '5eed0000-0000-4000-8000-000000000001', 'demo-sela-pass-day-trip',
   'Sela Pass day trip (sample)', 'Sample: high-altitude drive and lake stop.', 'adventure', 600, 450000, 'published'),
  ('5eed0000-0000-4000-8000-0000000000a1', '5eed0000-0000-4000-8000-000000000002', 'demo-ziro-pine-trek',
   'Ziro pine forest trek (sample)', 'Sample: trekking through pine forest.', 'trekking', 300, 150000, 'published'),
  ('5eed0000-0000-4000-8000-0000000000a1', '5eed0000-0000-4000-8000-000000000002', 'demo-ziro-festival-weekend',
   'Ziro music festival weekend (sample)', 'Sample: two days of live music.', 'festivals', 2880, 1200000, 'published'),
  ('5eed0000-0000-4000-8000-0000000000a1', '5eed0000-0000-4000-8000-000000000002', 'demo-apatani-food-trail',
   'Apatani food trail (sample)', 'Sample: local dishes and rice beer.', 'food_and_drink', 120, 80000, 'published'),
  ('5eed0000-0000-4000-8000-0000000000a4', '5eed0000-0000-4000-8000-000000000003', 'demo-dirang-orchard-walk',
   'Dirang orchard and dzong walk (sample)', 'Sample: orchards and the old dzong.', 'culture', 200, 90000, 'published'),
  ('5eed0000-0000-4000-8000-0000000000a4', '5eed0000-0000-4000-8000-000000000003', 'demo-sangti-birding',
   'Sangti valley birding (sample)', 'Sample: winter birding in the valley.', 'wildlife', 420, 250000, 'published'),
  ('5eed0000-0000-4000-8000-0000000000a4', '5eed0000-0000-4000-8000-000000000005', 'demo-bomdila-monastery-market',
   'Bomdila monastery and market (sample)', 'Sample: monastery visit and market stroll.', 'culture', 240, 60000, 'published'),
  ('5eed0000-0000-4000-8000-0000000000a4', '5eed0000-0000-4000-8000-000000000005', 'demo-bomdila-dirang-trek',
   'Bomdila to Dirang trek (sample)', 'Sample: two-day ridge trek.', 'trekking', 2880, 900000, 'published'),
  ('5eed0000-0000-4000-8000-0000000000a1', '5eed0000-0000-4000-8000-000000000006', 'demo-siang-rafting',
   'Siang river rafting (sample)', 'Sample: rafting on the Siang.', 'adventure', 360, 350000, 'published'),
  ('5eed0000-0000-4000-8000-0000000000a1', '5eed0000-0000-4000-8000-000000000006', 'demo-pasighat-picnic',
   'Pasighat riverside picnic (sample)', 'Sample: price on request.', 'nature', 240, null, 'published'),
  ('5eed0000-0000-4000-8000-0000000000a1', '5eed0000-0000-4000-8000-000000000006', 'demo-adi-homestay',
   'Adi village homestay night (sample)', 'Sample: one night with an Adi family.', 'culture', 1440, 280000, 'published'),
  ('5eed0000-0000-4000-8000-0000000000a4', '5eed0000-0000-4000-8000-000000000007', 'demo-namdapha-jungle-walk',
   'Namdapha jungle walk (sample)', 'Sample: guided rainforest walk.', 'wildlife', 480, 400000, 'published'),
  ('5eed0000-0000-4000-8000-0000000000a4', '5eed0000-0000-4000-8000-000000000007', 'demo-namdapha-camp',
   'Namdapha three-day camp (sample)', 'Sample: three days camping in the park.', 'trekking', 4320, 1500000, 'published'),
  ('5eed0000-0000-4000-8000-0000000000a4', '5eed0000-0000-4000-8000-000000000001', 'demo-tawang-yoga',
   'Tawang yoga retreat (sample)', 'Sample: a day of yoga and meditation.', 'wellness', 720, 200000, 'published');

-- Hidden: each fails exactly one visibility condition.
insert into public.experiences
  (provider_id, destination_id, slug, title, summary, category, duration_minutes, price_from_minor, status)
values
  ('5eed0000-0000-4000-8000-0000000000a1', '5eed0000-0000-4000-8000-000000000004', 'demo-mechuka-hidden',
   'Mechuka trek (sample, hidden: destination unpublished)', '', 'trekking', 480, 300000, 'published'),
  ('5eed0000-0000-4000-8000-0000000000a2', '5eed0000-0000-4000-8000-000000000001', 'demo-draft-provider-tour',
   'Tawang tour (sample, hidden: provider unverified)', '', 'culture', 240, 200000, 'published'),
  ('5eed0000-0000-4000-8000-0000000000a3', '5eed0000-0000-4000-8000-000000000006', 'demo-suspended-raft-run',
   'Siang rapids raft run (sample, hidden: provider suspended)', 'Rafting', 'adventure', 300, 300000, 'published'),
  ('5eed0000-0000-4000-8000-0000000000a1', '5eed0000-0000-4000-8000-000000000002', 'demo-ziro-night-sky',
   'Ziro night sky (sample, hidden: draft experience)', '', 'nature', 120, 70000, 'draft'),
  ('5eed0000-0000-4000-8000-0000000000a1', '5eed0000-0000-4000-8000-000000000008', 'demo-anini-drive',
   'Anini valley drive (sample, hidden: destination draft)', 'Rafting and drives', 'adventure', 600, 500000, 'published');

-- Bookable dates (Phase 4), relative to today in India so the seed never goes stale.
-- tests/e2e/bookings.spec.ts relies on these.
insert into public.availability_slots (experience_id, starts_on, capacity)
select e.id, private.today_ist() + d.offset_days, d.capacity
from public.experiences e
join (values
  ('demo-siang-rafting', 5, 6),
  ('demo-siang-rafting', 12, 6),
  ('demo-ziro-village-walk', 7, 8),
  ('demo-sela-pass-day-trip', 9, 4)
) as d(slug, offset_days, capacity) on d.slug = e.slug;
