# Task Report: Everything bookable (partner switch, any-date requests, book whole trip)

- Date: 2026-10-15
- Author: Claude Code (agent)
- Branch / commit: main / uncommitted (base a970730)

## Objective and scope

The product owner's request was "everything should be bookable". It was clarified as:

- tourism partners choose per experience whether it can be booked;
- the AI generates only bookable itineraries;
- travellers can "book whole trip".

The plan was approved before work started, including request limits raised to 30 per hour, 60 per
day and 40 open requests.

Acceptance criteria:

- `accepts_bookings` is on by default and only the owning provider can change it.
- Bookable experiences can be requested for any date from tomorrow.
- Published slots keep their seat limits.
- AI retrieval uses only bookable experiences.
- The owner can request every item of an itinerary version at once, without duplicates on retry.

Out of scope: payments, notifications, and production deployment (pending owner approval).

## Summary of implementation

**Database** (`20261014205730_bookable_experiences_and_trip_booking`):

- `experiences.accepts_bookings`.
- `bookings.slot_id` is now optional.
- Shared private function `create_booking_request`.
- New `request_booking_on_date` and `request_itinerary_bookings`.
- Confirm, cancel and sweep now handle bookings without a slot.
- Request limits raised.

**App:**

- The experience page has a date picker; published dates are shown as hints.
- The partner dashboard has a "Stop booking requests" / "Accept booking requests" switch.
- AI retrieval filters on `accepts_bookings`.
- The itinerary page has a "Book this trip" section with results for each item.

**Independent security review:** no blockers. These six should-fix issues were all fixed:

- S1: closed dates could still be requested.
- S2: a slot published after a request could be overbooked on confirmation.
- S3: a retry after a slot appeared was wrongly reported as a key mismatch.
- S4: concurrent calls could bypass the request limits. Fixed with a per-traveller advisory lock.
- S5: dates had no upper bound. Now capped at 2 years.
- S6: the whole-trip loop caught every error. It now catches only expected refusals.

Nits:

- N1 (an existence oracle) is fixed.
- N3–N6 are documented in the ADR-0004 amendment.
- N7 test gaps are covered by new pgTAP tests.

## Files

| Change | Path |
| --- | --- |
| Created | `supabase/migrations/20261014205730_bookable_experiences_and_trip_booking.sql` |
| Created | `supabase/tests/bookable.test.sql` (41 tests) |
| Created | `src/features/bookings/components/trip-booking.tsx`, `trip-booking-section.tsx` |
| Modified | `supabase/tests/privileges.test.sql`, `rate_limits.test.sql` |
| Modified | `src/server/bookings/repository.ts`, `src/features/bookings/{actions,schemas}.ts`, `components/{booking-forms,experience-booking}.tsx` |
| Modified | `src/server/providers/providers.ts`, `src/features/providers/{actions,schemas}.ts`, `components/provider-forms.tsx`, `src/app/provider/page.tsx` |
| Modified | `src/server/itineraries/{retrieval,repository}.ts`, `src/server/catalog/catalog.ts`, `src/lib/booking-options.ts` |
| Modified | `src/app/(site)/experiences/[slug]/page.tsx`, `src/app/(site)/itineraries/[id]/page.tsx`, `src/types/database.ts` |
| Modified | `tests/unit/{bookings,actions,itinerary-retrieval}.test.ts`, `tests/e2e/{bookings,itineraries}.spec.ts` |
| Modified | `docs/decisions/ADR-0004-BOOKING-LIFECYCLE.md` (amendment), `docs/product/BOOKING_POLICY.md`, `docs/database/DATABASE_DESIGN.md`, `docs/ai/AI_ARCHITECTURE.md` |

## Architectural and database changes

- There are no new tables. The new functions are `security definer` with `search_path = ''`.
- The private helpers can't be executed by API roles, which is checked by the privileges snapshot
  test.
- The new public functions are granted to `authenticated` only.

## Security and migration implications

- **Backward compatible.** The old `request_booking(slot)` signature is kept and still works, so the
  deployed code keeps working once the migration is applied. Apply the migration first, then deploy
  the code.
- **Rollback:** redeploy the old code. The schema additions are harmless to it.
- **No secret-key client is used.** All authorization happens in the database functions and RLS.

## Tests and commands executed

| Command | Result (actual) |
| --- | --- |
| `npm run verify` | Pass. 303 unit tests; build OK |
| `npm run test:e2e` | Pass. 57 tests, including 4 new ones: any-date request, past date, partner switch, book whole trip |
| `npm run test:integration` | Pass. 4 tests |
| `npm run db:test` (local DB) | 348 of 350. The 2 failures are pre-existing count-based tests (`admin can read all profiles`, `counts today's generations`) polluted by local E2E data (80 profiles, 22 generations). They are unrelated to this change. |
| All 12 pgTAP files against a throwaway copy, migration applied from the file, test data cleared | 350 of 350 pass |

## Build, lint and type-check status

- Format: pass
- Lint: pass
- Typecheck: pass
- Unit: pass (303)
- Build: pass
- E2E: pass (57)
- DB tests: pass on clean data (350/350); 2 environment failures on the polluted local DB

## Known issues, limitations, unverified assumptions

- **Not applied to production yet.** The migration needs `supabase db push`, which needs the owner's
  approval.
- **Local database:** the migration was applied with `supabase migration up`, then resynced to the
  final file in one transaction (deleting 9 `@example.test` slot-less bookings). `supabase db reset`
  was not run, to keep local data.
- **No notifications:** providers aren't notified of new requests, as before.

## Environment variables or manual steps required

1. Approve and run `supabase db push` against production.
2. Deploy the code (`vercel deploy --prod`, because Git auto-deploy isn't connected).

## Follow-up tasks

- Notifications for new booking requests.
- Optionally enforce `accepts_bookings` in `save_itinerary_version`.
