# Task Report: Phase 3a: partner listing types (guides, stays, transport)

- Date: 2026-10-15
- Author: Claude Code (agent)
- Branch / commit: main / see git log (base f596f0d)

## Objective and scope

Make guides, stays and transport real, bookable listing types, alongside experiences.

Owner decisions:

- one room type per stay;
- transport is private vehicle hire;
- guides are priced per group or per person per day (partner's choice);
- deliver 3a first, then 3b.

3b (AI itineraries with stays and transport) is out of scope here.

## Summary of implementation

See [ADR-0008](../../docs/decisions/ADR-0008-LISTING-TYPES.md).

- **Migration `20261015095327_listing_types`:**
  - type, price unit, capacity, guests, languages and route on listings, with per-type checks;
  - date range, units and pickup note on bookings;
  - `request_listing_booking`;
  - a capacity check under a listing row lock on confirmation;
  - the sweep completes bookings after their last day.
- **Browse pages:** `/stays`, `/guides` and `/transport`. Type-aware cards and detail pages, and a
  booking form for each type with a live estimate.
- **Partner portal:** choose the type when creating a listing, plus type-specific fields when
  creating and editing; non-experience listings show availability notes instead of dated slots.
- **Booking pages** show date ranges and quantities.
- **AI planning** stays experiences-only until 3b.
- **Found during type-checking:** the new second foreign key to destinations made existing embeds
  ambiguous, which would have broken live pages. Every embed now names
  `destinations!experiences_destination_id_fkey`.

## Tests and commands executed

| Command                           | Result                                                               |
| --------------------------------- | -------------------------------------------------------------------- |
| `npm run db:test`                 | 425 passed (16 files; `listing_types.test.sql` has 24)               |
| `npx vitest run tests/unit`       | 341 passed                                                           |
| `npm run test:e2e -- --workers=1` | 64 passed (includes a new stay end-to-end flow and the browse pages) |
| `npm run verify`                  | see the commit                                                       |

## Security and migration implications

- New public RPC `request_listing_booking`, granted to authenticated users only (pinned by
  `privileges.test.sql`).
- Backward compatible: existing rows default to experience / per person.
- An independent security review is in progress. Its findings will be handled in a follow-up commit.

## Environment variables or manual steps required

The owner runs `supabase db push` (1 migration), then `vercel deploy --prod`.

## Follow-up tasks

- Phase 3b: per-night stays and transport legs in AI itineraries, and in whole-trip booking.
- Admin moderation: show the listing type.
