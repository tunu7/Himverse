-- Clears the whole catalogue and everything built on it, before launch:
-- destinations, all listings (experiences, stays, guides, transport) with their
-- dates, every saved itinerary ("Plan a trip"), and every booking (which point
-- at listings and would otherwise block their removal). Also removes the
-- sample partners. Accounts, partners and admins are kept.
-- Refuses to run if any payment or refund exists: money records are never
-- deleted (ADR-0005). One statement, so it runs as one transaction.
--   npx supabase db query --linked -f supabase/sample-content/remove-all.sql

do $$
begin
  if exists (select 1 from public.payments) or exists (select 1 from public.refunds) then
    raise exception 'payments or refunds exist; not deleting bookings';
  end if;

  delete from public.bookings;         -- booking events cascade
  delete from public.itineraries;      -- versions and items cascade
  delete from public.experiences;      -- slots cascade; covers every listing type
  delete from public.providers
  where slug in ('sample-tawang-monastery-tours', 'sample-sela-adventures', 'sample-ziro-valley-hosts',
    'sample-ziro-trails', 'sample-dirang-valley-walks', 'sample-bomdila-ridge-guides', 'sample-siang-river-co',
    'sample-namdapha-wild', 'sample-mechuka-valley-treks', 'sample-mayodia-roads', 'himverse-sample-listings');
  delete from public.destinations;
end $$;
