-- Guides in AI itineraries (owner decision 2026-10-16, ADR-0008 addendum).
-- On its own: a new enum value can't be used in the transaction that adds it.
alter type public.itinerary_item_kind add value if not exists 'guide';
