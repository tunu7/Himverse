# Task report: partner dashboard by service type, online/offline switches

Date: 2026-10-16

## Request

The partner dashboard should differ by type of business. Partners should be able to keep each
listing online (bookable) or switch it off, for stays, guides, transport and experiences.

## What changed

- **Dashboard (`/provider`):**
  - New "Your services" panel: one card per listing type the partner offers. Each card shows how
    many listings are taking requests, published and in total, plus confirmed bookings in the next
    30 days (from `bookings.listing_type`).
  - With no listings yet, a "What do you offer?" panel links to the add form with that type
    preselected (`/provider/listings?type=stay`).
  - The checklist step is now "Put a listing online for booking requests".
- **Listings (`/provider/listings`):**
  - Listings are grouped by type.
  - Each row describes the listing in its type's own terms (`listingSummaryParts`): rooms for
    stays, guides and languages for guides, route and vehicles for transport, duration for
    experiences.
  - A real on/off switch (`role="switch"`, Online/Offline) replaces the "Stop/Accept booking
    requests" button. It is also on the listing detail page.
  - A per-type switch ("Take all stays offline" / "Put all stays online") uses the new action
    `changeListingTypeAcceptsBookings` and the server function `setListingTypeAcceptsBookings`.
    The business comes from the session, never from the form; RLS limits the update to members;
    re-running it changes nothing.
- **Bug fix (pre-existing):** after saving a listing, React reset the add form and the type
  dropdown showed "Experience" while the page kept the type chosen before (e.g. stay). The dropdown
  now remounts on reset.
- **No database change.** `experiences.accepts_bookings` already existed; only new requests and AI
  plans check it (`private.is_experience_bookable`), so existing bookings and waiting requests are
  unaffected.

## Tests

- **Unit:** `listingSummaryParts` for all four types and for an unpublished destination.
- **E2E, new:** `partner-services.spec.ts`. A fresh partner picks "Stays", adds two rooms, takes all
  stays offline, puts one back online, and the dashboard shows the Stays card.
- **E2E, updated:**
  - `bookings.spec.ts` uses the switch;
  - `listing-types.spec.ts` checks the stays group;
  - `provider-lifecycle.spec.ts` opens Experiences sorted by newest. The default order is by id, so a
    new listing could land on page 2; that test was flaky before this change.

## Results (run 2026-10-16)

| Command | Result |
| --- | --- |
| `npm run verify` | Pass (see final run below) |
| `npm run test:e2e` (branch stack, fresh DB) | 76 passed, 2 failed: forgot-password (its Mailpit port is hard-coded to the main stack; known) and `booking-alerts` (two-step redirect timing). `booking-alerts` passed 3/3 when rerun alone |

## Follow-ups

- Optional: let partners choose a primary business type at sign-up, if the owner wants the dashboard
  to adapt before the first listing.
