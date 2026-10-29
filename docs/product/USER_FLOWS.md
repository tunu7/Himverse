# User Flows (MVP)

Flows describe intended behaviour, with their implementation status. Each flow lists the states the UI
must handle explicitly (loading, empty, success, error). Scope: [MVP_SCOPE](MVP_SCOPE.md).

## T1 — Discover destinations and experiences (traveler, anonymous or signed in) — implemented (Phase 2)

1. Traveler browses `/destinations` (search, region) or `/experiences` (search, region, category,
   budget, duration, sort), with pagination and shareable URLs.
2. Sees only published destinations and experiences from verified providers at published destinations.
3. Opens a detail page:
   - **Destination:** description, district, and its public experiences.
   - **Experience:** description, category, duration, indicative price, location and provider.

States: loading placeholder; empty results with "clear all filters"; out-of-range page with a link back;
ignored-parameter notice; not-found detail pages; error with retry.

Not yet available: seasonality and access notes (no schema yet), imagery (needs a storage ADR),
relevance-ranked search.

## T2 — Generate an itinerary (signed-in traveler) — implemented (Phase 3, mock-verified)

1. Traveler enters trip parameters: start date or month, duration, group size, budget band,
   interests, pace, constraints (mobility, diet, altitude tolerance).
2. Input is validated; the server retrieves candidate catalogue items and asks the AI to compose a plan.
3. Output is schema-validated and grounded (every item ID exists and is published); invalid output is
   retried or reported — never shown raw.
4. Traveler sees a day-by-day plan with items linked to catalogue pages and clearly labelled as
   AI-suggested. Prices are indicative; nothing is shown as booked or available unless confirmed.

States: progress while generating; partial failure ("we couldn't fit X"); hard failure with retry.

## T3 — Refine an itinerary — implemented (Phase 3, mock-verified)

1. Traveler adjusts parameters or asks for changes (e.g. "less driving", "add a monastery visit").
2. A new itinerary version is created; previous versions remain viewable.

## T4 — Book — implemented (instant booking 2026-10-29; see BOOKING_POLICY.md)

1. From a listing page, traveler picks one of the dates the provider published (experiences) or a date
   range and quantity (guides, stays, transport), and the group size; or, from an itinerary, uses
   **Book whole trip** to book every item on its day at once.
2. Server checks availability from authoritative data under a lock and, if there is room, **confirms
   the booking at the listed price straight away** (idempotency key: double-click/retry safe). A full
   date is refused with a clear message.
3. Status shows **Confirmed**. When an admin requires deposits, the traveller pays 50% online within
   1 hour or the booking is cancelled and the place freed.
4. **Listings without a price** stay a request (**Awaiting provider confirmation**): the provider sets a
   total or declines (P2), the traveller sees **New price awaiting approval** and accepts it or cancels,
   within 48 h. Unanswered requests expire.

## T5 — View trip — implemented (itineraries and bookings)

Traveler sees itineraries, booking statuses, provider contact details for confirmed bookings, and
essential trip information (permit guidance scope is an open question in the [MVP_SCOPE](MVP_SCOPE.md)).

## P1 — Partner onboarding — implemented (Phase 1)

Partner signs up in Tourism partner mode, submits profile and verification details, and lands in the
partner portal; admin verifies (A1). Unverified partners cannot publish listings. Partners use
two-step login and can list experiences, guides, stays and transport (ADR-0008).

The dashboard adapts to what the business offers. Before any listing it asks "What do you offer?" and
opens the add form on that type. Afterwards it shows one card per type offered: listings taking
requests, published, total, and confirmed bookings in the next 30 days. The listings page groups
listings by type and describes each in its own terms (rooms, guides and languages, route and
vehicles, duration).

## P2 — Partner manages bookings — implemented (Phase 4)

Provider sees its own bookings only. Instant bookings arrive already confirmed and are flagged as new
for 48 hours; the provider can cancel one with a reason (full refund of any deposit). Requests for
listings without a price are priced or declined. The provider publishes and closes experience dates
(experiences are booked only on those) and switches each listing **online or offline** (online = taking
bookings and usable in AI trip plans; offline listings stay published but take no new bookings). A
per-type switch takes every stay, guide, transport or experience listing offline or online at once, for
example a homestay closed for the season. Existing bookings are unaffected.

## A1 — Admin verification and curation — implemented (admin console)

Admin reviews provider submissions, marks providers verified, and publishes/unpublishes experiences.
All admin actions are audit-logged.
