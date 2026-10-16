-- Store the listing type on each booking, so its labels (nights, rooms,
-- vehicles, guides) survive when the listing is later archived or hidden and
-- the viewer can no longer read it through RLS.
--
-- Set by a trigger from the experience at insert time, so every booking path
-- (request_booking, request_booking_on_date, request_itinerary_bookings and
-- owner-run SQL) is covered without redefining them. A listing's type never
-- changes after creation, and neither does the booking's copy.
-- Readable through the existing table-level select grant; no write grant.

alter table public.bookings add column listing_type public.listing_type;

update public.bookings b
set listing_type = e.listing_type
from public.experiences e
where e.id = b.experience_id;

alter table public.bookings alter column listing_type set not null;

create function private.set_booking_listing_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.listing_type is distinct from old.listing_type then
      raise exception 'a booking''s listing type cannot change' using errcode = '42501';
    end if;
    return new;
  end if;
  select e.listing_type into new.listing_type
  from public.experiences e
  where e.id = new.experience_id;
  return new;
end;
$$;

revoke all on function private.set_booking_listing_type() from public, anon, authenticated;

-- Named after bookings_a_ and bookings_b_ (BEFORE triggers fire alphabetically);
-- the shape check doesn't depend on this column.
create trigger bookings_c_listing_type
  before insert or update of listing_type on public.bookings
  for each row execute function private.set_booking_listing_type();
