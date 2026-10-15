# ADR-0008: Partner listing types (experiences, guides, stays, transport)

- Status: Accepted
- Date: 2026-10-15
- Deciders: Product owner (stay granularity, transport model, guide pricing, phasing), Engineering
- Implementation: Phase 3a, migration `20261015095327_listing_types`, pgTAP
  `supabase/tests/listing_types.test.sql`. Phase 3b (AI itineraries with stays and transport) follows.

## Context

The MVP scope includes stays, transport and guides offered by verified local partners. These must be
bookable and, in Phase 3b, usable in AI itineraries. Until now, partners could only list
"experiences": one date, priced per person, with optional seat-capped dates. The other three types are
bought differently, so each needs its own booking shape.

## Decision

**One generic listings model.** The existing `experiences` table holds every listing type. It isn't
renamed, because a rename would ripple through RLS, RPCs and tests; the UI calls them "listings".

| Type       | Price units                                         | `daily_capacity`                    | `max_guests`         | Booking                                                       |
| ---------- | --------------------------------------------------- | ----------------------------------- | -------------------- | ------------------------------------------------------------- |
| experience | `per_person`                                        | — (optional dated slots with seats) | —                    | one date                                                      |
| guide      | `per_group_day` or `per_person_day` (owner: "both") | guides available per day            | group size per guide | start to end date, guides                                     |
| stay       | `per_room_night`                                    | rooms of this room type             | guests per room      | check-in to check-out, rooms                                  |
| transport  | `per_vehicle_trip` or `per_vehicle_day`             | vehicles available per day          | seats per vehicle    | a date (trip) or date range (day hire), vehicles, pickup note |

### Owner decisions

- **A stay is one room type.** A homestay with two kinds of room has two listings.
- **Transport is private vehicle hire.** A transport listing goes from its destination to
  `route_to_destination_id`; when that is empty, it is day hire around the destination.
- **Guides choose their pricing:** per group per day, or per person per day.
- **Phasing:** 3a (types end to end), then 3b (AI itineraries).

### Database rules

- **Shape:** a check constraint enforces each type's price unit and required fields.
- **Fixed type:** `listing_type` can be inserted but not updated.
- **Slots:** dated seat slots are allowed for experiences only.
- **Bookings** gain:
  - `ends_on`: the inclusive last service day, which for a stay is its last night;
  - `units`: rooms, vehicles or guides;
  - `pickup_note`.

  An insert trigger makes guides, stays and transport bookable only through `request_listing_booking`,
  which always sets the date range.

- **`request_listing_booking`:**
  - checks dates (from tomorrow, within two years), length (a stay at most 30 nights; other types at
    most 14 days; a trip one date), units against capacity, and party against units × max guests;
  - computes the estimate with `private.estimate_listing_total`;
  - takes the per-traveller advisory lock;
  - is idempotent;
  - hands experiences off to the existing path.
- **Confirmation** (`respond_to_booking`) locks the listing row (`FOR UPDATE`) and checks that every
  day still has room: confirmed units + this booking ≤ `daily_capacity`. Concurrent confirmations for
  one listing are therefore serialised and can't overbook.
- **Completion:** the sweep completes a booking after its last service day.

### App

- **Browse pages:** `/stays`, `/guides` and `/transport`, sharing the experiences search.
- **Listing pages:** show type-specific facts and a booking form for each type, with a live estimate
  using the same formula as the database.
- **Partner forms:** creating a listing starts by choosing its type.
- **AI planning:** uses experiences only until 3b (`retrieval.ts`).

## Alternatives considered

- **Separate tables per type:** cleaner columns, but booking, RLS and moderation logic would be
  duplicated four times. Rejected.
- **Property with several room types:** closer to Booking.com, but nested inventory and multi-room
  bookings are too much for MVP homestays. The owner chose one room type per listing.
- **Shared transport seats on timetables:** needs schedules. It could be added later as another price
  unit.

## Consequences

- Every listing feature (moderation, bookable switch, two-step rules, whole-trip booking) carries over.
- `experiences` gained a second foreign key to `destinations`, so embeds must name
  `destinations!experiences_destination_id_fkey`.
- **3b** will add per-night stays and transport legs to the itinerary schema and validation, and to
  whole-trip booking.
