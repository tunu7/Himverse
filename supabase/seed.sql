-- LOCAL DEVELOPMENT SEED ONLY. Runs on `npx supabase db reset` against the
-- local Docker database. Never run against staging or production.
--
-- Does NOT create users or admins (see the admin bootstrap runbook in
-- docs/security/AUTHORIZATION_AND_RLS.md). The demo provider below has no
-- members; it exists only so /explore has something to show locally.

insert into public.destinations (id, slug, name, district, summary, is_published)
values
  ('5eed0000-0000-4000-8000-000000000001', 'tawang', 'Tawang', 'Tawang',
   'High-altitude monastery town near the Sela Pass.', true),
  ('5eed0000-0000-4000-8000-000000000002', 'ziro', 'Ziro Valley', 'Lower Subansiri',
   'Pine-ringed valley known for Apatani villages and rice fields.', true),
  ('5eed0000-0000-4000-8000-000000000003', 'dirang', 'Dirang', 'West Kameng',
   'River valley with hot springs and orchards.', true),
  ('5eed0000-0000-4000-8000-000000000004', 'mechuka', 'Mechuka', 'Shi Yomi',
   'Remote valley close to the border; draft content, not yet published.', false);

insert into public.providers (id, slug, display_name, description, district, status, verified_at)
values
  ('5eed0000-0000-4000-8000-0000000000a1', 'demo-local-provider', 'Demo Provider (local seed)',
   'Sample data for local development.', 'Lower Subansiri', 'verified', now()),
  ('5eed0000-0000-4000-8000-0000000000a2', 'demo-draft-provider', 'Draft Provider (local seed)',
   'Unverified sample provider; must never appear on /explore.', 'Tawang', 'draft', null);

insert into public.experiences
  (provider_id, destination_id, slug, title, summary, category, duration_minutes, price_from_minor, status)
values
  ('5eed0000-0000-4000-8000-0000000000a1', '5eed0000-0000-4000-8000-000000000002', 'demo-ziro-village-walk',
   'Apatani village walk (sample)', 'Sample experience for local development.', 'culture', 180, 120000, 'published'),
  ('5eed0000-0000-4000-8000-0000000000a1', '5eed0000-0000-4000-8000-000000000003', 'demo-dirang-hot-springs',
   'Dirang hot springs half day (sample)', 'Sample experience for local development.', 'wellness', 240, null, 'published'),
  ('5eed0000-0000-4000-8000-0000000000a1', '5eed0000-0000-4000-8000-000000000004', 'demo-mechuka-hidden',
   'Mechuka trek (sample, hidden: destination unpublished)', '', 'trekking', 480, 300000, 'published'),
  ('5eed0000-0000-4000-8000-0000000000a2', '5eed0000-0000-4000-8000-000000000001', 'demo-draft-provider-tour',
   'Tawang tour (sample, hidden: provider unverified)', '', 'culture', 240, 200000, 'published');
