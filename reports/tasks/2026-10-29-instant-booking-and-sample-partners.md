# Task Report: Instant booking and 10 bookable sample partners

- Date: 2026-10-29
- Author: Claude (agent), with owner decisions from Tunu Doley
- Branch / commit: main / uncommitted

## Objective and scope

Owner request (2026-10-29):

1. Sample content: 10 partners and 16 experiences, bookable, for testing.
2. A listing whose partner accepts bookings goes into AI plans; switched off, it doesn't (already built).
3. Bookings are confirmed automatically, with no partner or admin confirmation, for all listing types.

Owner answers: keep the 50% deposit; with deposits off, confirm with no payment; experiences bookable on
published dates only; 1-hour deposit window; sample partners bookable on production for testing.

Out of scope: email notifications, staging, changes to refund tiers, slot-aware day placement in the AI
model.

## Summary of implementation

Migration `20261029150442_instant_booking` re-defines `private.create_booking_request` and
`public.request_listing_booking` to call a new `private.instant_confirm` after inserting. It confirms at
the estimate through the existing `private.confirm_booking`, which checks capacity under row locks, and
returns the real status. Listings without a price stay requests (the existing partner-price and traveller
acceptance flow). Experiences are refused on dates without an open slot. Instant bookings with
deposits on get 1 hour to pay; the unpaid sweep runs every 5 minutes. `partner_booking_alerts()` adds
`new_bookings`; `my_booking_updates()` ignores the instant confirmation of one's own booking.

Parallel instant bookings deadlocked (40P01) because each insert's foreign-key share lock on the slot
blocked the others' `FOR UPDATE`. Fixed by locking the listing, then the slot, before inserting.

UI: "Book now" buttons, a date dropdown limited to published dates (or a "no dates open" state), new
wording on listing, trip and deposit panels, a partner "new bookings" bar and menu count, and the partner
bookings page defaulting to "Upcoming". The AI retriever only offers experiences with an open date
during the trip.

Sample content: `apply.sql` now creates 10 "(sample)" partners and 16 experiences with a daily date for 60
days (10 places), retires the earlier single non-bookable sample provider, and is one `DO` statement (the
previous multi-statement file was rejected by `supabase db query -f`). `remove.sql` also deletes bookings
made with sample partners and refuses if any has a payment or refund. The local `seed.sql` publishes
daily dates for 120 days.

## Files

| Change   | Path | Notes |
| -------- | ---- | ----- |
| Created  | `supabase/migrations/20261029150442_instant_booking.sql` | Instant confirmation, slots-only experiences, alerts, sweep schedule |
| Created  | `reports/tasks/2026-10-29-instant-booking-and-sample-partners.md` | This report |
| Modified | `supabase/sample-content/apply.sql`, `remove.sql`, `remove-all.sql` | 10 partners, 16 bookable experiences |
| Modified | `supabase/seed.sql` | Daily dates for local experiences |
| Modified | `src/features/bookings/components/*` (booking-forms, experience-booking, listing-booking-form, trip-booking, deposit-panel, partner-alert-bar, booking-detail) | Book-now UX and wording |
| Modified | `src/app/(site)/experiences/[slug]/page.tsx`, `src/app/(site)/bookings/page.tsx`, `src/app/provider/bookings/page.tsx`, `src/components/site-header.tsx` | Heading, copy, default view, alert count |
| Modified | `src/server/bookings/alerts.ts`, `src/server/itineraries/retrieval.ts`, `src/types/database.ts` | New alert column; slot-aware retrieval |
| Modified | 11 files in `supabase/tests/`, `tests/integration/booking-concurrency.test.ts`, `tests/unit/itinerary-retrieval.test.ts`, 10 files in `tests/e2e/` | Updated to the new flow |
| Modified | `CLAUDE.md`, ADR-0004, ADR-0005, ADR-0009, MVP_SCOPE, USER_FLOWS, BOOKING_POLICY, PAYMENTS, ENVIRONMENTS, RELEASE_CHECKLIST, TESTING_STRATEGY, ACCESSIBILITY, AI_ARCHITECTURE | Docs |
| Deleted  | None | |

## Architectural and database changes

No new tables or policies. Function changes are listed above. See the ADR-0004 amendment "instant
booking" and the ADR-0005 amendment "deposits with instant booking". `CLAUDE.md` rule 5 now names the
database's locked capacity check as an authoritative confirmation source.

## Security and migration implications

- No RLS changes. Travellers still can't write status or prices; confirmation happens only inside the
  security-definer request functions, at the database-computed estimate.
- Expand-compatible: deployed code keeps working (the returned status is now `confirmed`; the alert RPC
  adds a column). Existing open requests keep the old flow.
- Rollback: a migration re-creating the previous function bodies (from migrations
  `20261014205730`, `20261015101124`, `20261015125458`) and the 15-minute cron schedule.
- Accepted risks: partners learn of bookings only in-app; with deposits off nothing deters fake bookings
  (request limits still apply); sample partners on production accept real bookings nobody will serve.

## Tests and commands executed

| Command | Result (actual) |
| ------- | --------------- |
| `npx supabase db reset` | Migration and seed apply cleanly |
| `npm run db:test` | Pass: 23 files, 594 tests |
| `npm run test:integration` | Pass: 4/4, run 3 times (failed with deadlock 40P01 before the lock-order fix) |
| `npm run test:e2e` | 74 passed, 1 failed: `payments.spec.ts` (server log: `EnvValidationError: SUPABASE_SECRET_KEY` missing in the local env) |
| `npm run verify` | format, lint (0 errors, 2 existing warnings in `tests/unit/payments.test.ts`), typecheck, 402 unit tests pass; `next build` compiled then exited with Next's `SecurityFatalError` advisory for next 16.4.0 |
| `npm run build` (retry) | Pass |
| Sample content on local DB | Old apply → new apply ×2: 10 partners, 16 experiences, 960 dates, old provider gone; a booking confirmed at ₹7,000; `remove.sql` removed booking and samples |
| Relative links in changed docs | All resolve |

## Build, lint and type-check status

- Format: pass
- Lint: pass (2 existing warnings)
- Typecheck: pass
- Unit tests: pass (402)
- Build: pass on retry (first run stopped by the Next.js security advisory)
- E2E: 74 pass, 1 fail (payments, local env)
- DB tests: pass (594)

## Known issues, limitations, unverified assumptions

- `payments.spec.ts` not verified end to end in this session: the local `.env.local` lacks a valid
  `SUPABASE_SECRET_KEY` (not read or changed by the agent). The deposit rules are covered by pgTAP.
- The AI model can still place an experience on a trip day without a published date when the
  experience has some dates in the trip; that item then fails at "Book whole trip" with a clear reason.
- Production DB type-drift check (`db:types` against CI) not run separately; types were regenerated
  locally and match.
- Next.js 16.4.0 has a published security advisory (reported by `next build`).

## Environment variables or manual steps required

Owner runs, in order:

1. `npx supabase db push` (applies `20261029150442_instant_booking`).
2. Deploy the app.
3. `npx supabase db query --linked -f supabase/sample-content/apply.sql`.

Locally, to run the payments E2E: `node scripts/write-local-env.mjs --force` (rewrites `.env.local` from
the local stack), then `npm run build && npm run test:e2e`.

## Follow-up tasks

- Email notifications for new bookings (partners only see them in-app).
- Pass open dates to the AI model so it places experiences on bookable days.
- Upgrade Next.js for the security advisory.
- Remove sample content before launch (RELEASE_CHECKLIST).
