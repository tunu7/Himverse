-- Removes the sample content added by supabase/sample-content/apply.sql: the 10
-- sample partners, their experiences and dates, and any bookings travellers made
-- with them while testing. Refuses to run if any of those bookings has a payment
-- or refund (money records are never deleted, ADR-0005). Saved itineraries keep
-- their snapshots (items lose the experience link, as with any unpublished
-- experience). Destinations are kept only if a real partner's experience uses
-- them. To clear the whole catalogue, itineraries and bookings instead, use
-- remove-all.sql. One statement, so it runs as one transaction (`db query`
-- refuses multi-statement files).
--   npx supabase db query --linked -f supabase/sample-content/remove.sql

do $$
declare
  v_providers uuid[] := array(
    select id from public.providers
    where slug in ('sample-tawang-monastery-tours', 'sample-sela-adventures', 'sample-ziro-valley-hosts',
      'sample-ziro-trails', 'sample-dirang-valley-walks', 'sample-bomdila-ridge-guides', 'sample-siang-river-co',
      'sample-namdapha-wild', 'sample-mechuka-valley-treks', 'sample-mayodia-roads',
      'himverse-sample-listings'));
begin
  if exists (select 1 from public.payments where provider_id = any (v_providers))
     or exists (select 1 from public.refunds r join public.bookings b on b.id = r.booking_id
                where b.provider_id = any (v_providers)) then
    raise exception 'sample bookings have payments or refunds; settle them in the admin console first';
  end if;

  delete from public.bookings where provider_id = any (v_providers);      -- booking events cascade
  delete from public.experiences where provider_id = any (v_providers);   -- dates cascade
  delete from public.providers where id = any (v_providers);

  delete from public.destinations d
  where d.slug in ('tawang', 'ziro', 'dirang', 'bomdila', 'pasighat', 'namdapha', 'mechuka', 'roing')
    and not exists (select 1 from public.experiences e where e.destination_id = d.id);
end $$;
