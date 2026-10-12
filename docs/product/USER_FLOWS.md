# User Flows (MVP)

Flows describe intended behaviour; none are implemented yet. Each flow lists the states the UI must
handle explicitly (loading, empty, success, error).

## T1 — Discover experiences (traveler, anonymous or signed in)

1. Traveler opens the catalogue, filters by area, category, duration, budget or season.
2. Sees published experiences from verified providers only.
3. Opens an experience detail page: description, provider, indicative price, duration, seasonality,
   access notes.

States: loading skeleton; empty results with filter reset; error with retry.

## T2 — Generate an itinerary (signed-in traveler)

1. Traveler enters trip parameters: start date or month, duration, group size, budget band,
   interests, pace, constraints (mobility, diet, altitude tolerance).
2. Input is validated; the server retrieves candidate catalogue items and asks the AI to compose a plan.
3. Output is schema-validated and grounded (every item ID exists and is published); invalid output is
   retried or reported — never shown raw.
4. Traveler sees a day-by-day plan with items linked to catalogue pages and clearly labelled as
   AI-suggested. Prices are indicative; nothing is shown as booked or available unless confirmed.

States: progress while generating; partial failure ("we couldn't fit X"); hard failure with retry.

## T3 — Refine an itinerary

1. Traveler adjusts parameters or asks for changes (e.g. "less driving", "add a monastery visit").
2. A new itinerary version is created; previous versions remain viewable.

## T4 — Request a booking

1. From an itinerary item or experience page, traveler selects date and group size.
2. Server checks availability from authoritative data and creates a booking request with an
   idempotency key (double-click/retry safe).
3. Status shows **Requested — awaiting provider confirmation**.
4. Provider confirms or declines (P2). Traveler is notified and sees the updated status.
   Requests not answered in time expire (window: open question).

## T5 — View trip

Traveler sees itineraries, booking statuses, provider contact details for confirmed bookings, and
essential trip information (permit guidance scope is an open question in the [PRD](PRD.md#open-questions)).

## P1 — Provider onboarding

Provider signs up, submits profile and verification details; admin verifies (A1). Unverified providers
cannot publish experiences.

## P2 — Provider manages bookings

Provider sees incoming requests for their experiences only, confirms or declines with optional note,
and manages availability.

## A1 — Admin verification and curation

Admin reviews provider submissions, marks providers verified, and publishes/unpublishes experiences.
All admin actions are audit-logged.
