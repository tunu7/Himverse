-- Removes the sample content added by supabase/sample-content/apply.sql.
-- Saved itineraries keep their snapshots (items lose the experience link, as
-- with any unpublished experience). Destinations are kept only if a real
-- provider's experience uses them.
--   npx supabase db query --linked -f supabase/sample-content/remove.sql

begin;

delete from public.experiences
where provider_id = (select id from public.providers where slug = 'himverse-sample-listings');

delete from public.providers where slug = 'himverse-sample-listings';

delete from public.destinations d
where d.slug in ('tawang', 'ziro', 'dirang', 'bomdila', 'pasighat', 'namdapha', 'mechuka', 'roing')
  and not exists (select 1 from public.experiences e where e.destination_id = d.id);

commit;
