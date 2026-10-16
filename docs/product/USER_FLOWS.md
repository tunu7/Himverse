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

## T4 — Request a booking — implemented (Phase 4; see BOOKING_POLICY.md)

1. From an experience page, traveler selects any future date (published dates shown as hints) and group
   size; or, from an itinerary, uses **Book this trip** to request every item on its day at once.
2. Server checks availability from authoritative data and creates a booking request with an
   idempotency key (double-click/retry safe).
3. Status shows **Requested — awaiting provider confirmation**.
4. Provider confirms or declines (P2). Traveler is notified and sees the updated status.
   Requests not answered within 48 h (or by the start, if sooner) expire.
5. If the provider's final total is more than 10% above the estimate (or there was no estimate), the
   traveller sees **New price awaiting approval** and accepts it, or cancels the request, within 48 h.

## T5 — View trip — implemented (itineraries and bookings)

Traveler sees itineraries, booking statuses, provider contact details for confirmed bookings, and
essential trip information (permit guidance scope is an open question in the [MVP_SCOPE](MVP_SCOPE.md)).

## P1 — Partner onboarding — implemented (Phase 1)

Partner signs up in Tourism partner mode, submits profile and verification details, and lands in the
partner portal; admin verifies (A1). Unverified partners cannot publish listings. Partners use
two-step login and can list experiences, guides, stays and transport (ADR-0008).

## P2 — Partner manages bookings — implemented (Phase 4)

Provider sees incoming requests for their experiences only, confirms or declines with optional note,
manages availability, and can switch booking requests off.

## A1 — Admin verification and curation — implemented (admin console)

Admin reviews provider submissions, marks providers verified, and publishes/unpublishes experiences.
All admin actions are audit-logged.
