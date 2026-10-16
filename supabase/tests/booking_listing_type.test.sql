-- Listing type stored on bookings (migration booking_listing_type): copied from
-- the listing at insert, readable after the listing is hidden, never changed.
begin;
create extension if not exists pgtap with schema extensions;

select plan(6);

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('e1111111-1111-4111-8111-111111111111', 'blt.traveller@example.test', 'authenticated', 'authenticated', '{"account_type":"traveller"}'),
  ('e3333333-3333-4333-8333-333333333333', 'blt.partner@example.test', 'authenticated', 'authenticated', '{"account_type":"partner"}');
insert into public.providers (id, slug, display_name, status, verified_at)
values ('ec000000-0000-4000-8000-000000000001', 'blt-provider', 'BLT Provider', 'verified', now());
insert into public.provider_members (provider_id, user_id)
values ('ec000000-0000-4000-8000-000000000001', 'e3333333-3333-4333-8333-333333333333');
insert into public.destinations (id, slug, name, district, is_published)
values ('ed000000-0000-4000-8000-000000000001', 'blt-ziro', 'BLT Ziro', 'Lower Subansiri', true);
insert into public.experiences (id, provider_id, destination_id, slug, title, category, duration_minutes, price_from_minor, status,
  listing_type, price_unit, daily_capacity, max_guests, languages) values
  ('ee000000-0000-4000-8000-000000000001', 'ec000000-0000-4000-8000-000000000001', 'ed000000-0000-4000-8000-000000000001',
   'blt-room', 'Family room', 'culture', 1440, 300000, 'published', 'stay', 'per_room_night', 2, 3, '{}');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select lives_ok(
  $$ select * from public.request_listing_booking('ee000000-0000-4000-8000-000000000001', private.today_ist() + 10, private.today_ist() + 11,
       1, 2, 0, '+91 98765 43210', '', '', 'f2000000-0000-4000-8000-000000000001') $$,
  'a traveller requests a stay');
select results_eq(
  $$ select listing_type::text from public.bookings where idempotency_key = 'f2000000-0000-4000-8000-000000000001' $$,
  $$ values ('stay') $$,
  'the booking stores the listing type');

-- The partner archives the listing: the traveller can no longer read it, but the booking keeps its type.
reset role;
update public.experiences set status = 'archived' where id = 'ee000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select is_empty(
  $$ select 1 from public.experiences where id = 'ee000000-0000-4000-8000-000000000001' $$,
  'the archived listing is hidden from the traveller');
select results_eq(
  $$ select listing_type::text from public.bookings where idempotency_key = 'f2000000-0000-4000-8000-000000000001' $$,
  $$ values ('stay') $$,
  'the traveller still sees the booking''s listing type');

reset role;
select throws_ok(
  $$ update public.bookings set listing_type = 'experience' where idempotency_key = 'f2000000-0000-4000-8000-000000000001' $$,
  '42501', null,
  'a booking''s listing type cannot change, even for the owner role');
select col_not_null('public', 'bookings', 'listing_type', 'listing_type is required');

select * from finish();
rollback;
