# Task Report: Phase 4 — Booking lifecycle

- Date: 2026-10-12
- Author: Claude Code (Opus 5.5), plan approved
- Branch / commit: `main`, **uncommitted** on top of `ec56e03` (no commit, push or deploy)

## Objective and scope

A reliable booking system:

- travellers request eligible experiences;
- providers manage availability and confirm or decline;
- both parties see status and history;
- transitions are validated on the server;
- duplicates and retries are safe;
- availability is re-checked at confirmation.

Business decisions you made before implementation:

- **Availability:** dated slots, with the provider confirming; requests don't hold seats.
- **Price:** an estimate at request time, then a provider-confirmed final price.
- **Expiry and cancellation:** 48 h to respond; travellers can cancel up to 24 h before the start.
- **Contact:** a phone number given at booking.

Out of scope (not built): payments, notifications, rescheduling, no-show and dispute handling. These are
documented as open questions in [BOOKING_POLICY](../../docs/product/BOOKING_POLICY.md).

## Summary of implementation

- **[ADR-0004](../../docs/decisions/ADR-0004-BOOKING-LIFECYCLE.md)** and
  [BOOKING_POLICY](../../docs/product/BOOKING_POLICY.md) cover the implemented rules and the open
  business questions.
- **Migration `20261012180243_bookings`:**
  - **Tables:**
    - `availability_slots`, with the **check constraint `seats_confirmed <= capacity`**;
    - `bookings`, with unique (`traveler_id`, `idempotency_key`), a **partial unique index for one
      active booking per traveller per slot**, snapshots (traveller name, experience title, slot date
      and time, price estimate) and the provider's final price;
    - `booking_events`, an append-only history.
  - **Functions** (security definer, `search_path=''`):
    - `request_booking`: idempotent, including under a race through `on conflict`; derives provider,
      price and expiry; checks eligibility; refuses booking your own provider's experience;
    - `respond_to_booking`: provider members of a **verified** provider only; refuses expired
      requests; **locks the slot and re-checks seats, slot and experience visibility** on confirm;
    - `cancel_booking`: traveller and provider rules, and releases seats;
    - `private.sweep_bookings`: scheduled every 15 minutes with **`pg_cron`**.
  - **Access:**
    - no API role can write status, price, provider or ownership;
    - RLS limits bookings to the traveller, the booking's provider members, and admins (read-only).
- **App:**
  - `src/lib/booking-options.ts`: rules mirrored for display, including showing an overdue request as
    expired immediately;
  - `src/server/bookings/repository.ts`, plus `src/features/bookings/` (schemas, actions, forms, status
    badge, the experience-page booking section);
  - **pages:**
    - a "Request to book" section on experience pages, whose form carries a server-generated
      idempotency key;
    - `/bookings` and `/bookings/[id]` (price, history, cancel, respond);
    - `/provider/bookings`;
    - date management in `/provider`;
  - `/bookings` protected by the proxy; a "Bookings" nav link.
- **Seed:** four bookable sample dates, relative to today in IST.
- **Tests:**
  - a pgTAP booking suite (59 assertions) and a privilege-snapshot update;
  - **a concurrency integration suite over parallel connections** (`pg` dev dependency,
    `npm run test:integration`, added to the CI database job);
  - unit tests for rules, schemas and actions;
  - booking E2E tests and shared E2E helpers.

## Files

| Change | Path | Notes |
| --- | --- | --- |
| Created | `supabase/migrations/20261012180243_bookings.sql` | Tables, RLS, functions, cron schedule |
| Created | `supabase/tests/bookings.test.sql` | 59 assertions |
| Created | `tests/integration/booking-concurrency.test.ts`, `vitest.integration.config.mts` | Parallel connections |
| Created | `src/lib/booking-options.ts`, `src/server/bookings/repository.ts`, `src/features/bookings/{schemas,actions}.ts`, `src/features/bookings/components/{booking-forms,booking-status,experience-booking}.tsx` |  |
| Created | `src/app/bookings/{page,[id]/page,[id]/not-found}.tsx`, `src/app/provider/bookings/page.tsx` |  |
| Created | `tests/unit/bookings.test.ts`, `tests/e2e/bookings.spec.ts`, `tests/e2e/support.ts` |  |
| Created | `docs/decisions/ADR-0004-BOOKING-LIFECYCLE.md`, `docs/product/BOOKING_POLICY.md`, this report |  |
| Modified | `src/app/experiences/[slug]/page.tsx`, `src/app/provider/page.tsx`, `src/proxy.ts`, `src/components/site-header.tsx`, `src/lib/format.ts` | Booking section, date management, protection, nav, `formatSlot` |
| Modified | `supabase/seed.sql` | Bookable dates |
| Modified | `supabase/tests/{privileges,catalog,discovery,providers,security_review,system_roles,itineraries}.test.sql` | Snapshot; truncate the new tables |
| Modified | `vitest.config.mts`, `package.json`, `package-lock.json`, `.github/workflows/ci.yml` | Unit/integration split; `pg` + `@types/pg` (dev); CI step |
| Modified | `src/types/database.ts` | Regenerated |
| Modified | `docs/{database/DATABASE_DESIGN,security/AUTHORIZATION_AND_RLS,product/ROADMAP,product/USER_FLOWS,engineering/TESTING_STRATEGY,architecture/PROJECT_STRUCTURE,operations/DEPLOYMENT,decisions/README}.md`, `README.md` |  |

## Security and migration implications

- **Untrusted inputs:** client-supplied prices, provider IDs, status and ownership are never accepted.
  The form schema rejects them, and the database derives them (unit tests + pgTAP).
- **Isolation:**
  - providers can't see or act on other providers' bookings or dates;
  - travellers can't see other travellers' bookings;
  - non-parties get "not found" (pgTAP + E2E).
- **Integrity:**
  - overbooking is prevented by a row lock **and** a check constraint;
  - duplicates are prevented by unique constraints;
  - both are proven under real parallelism (integration).
- **Privacy:**
  - providers see the traveller's display name and the phone given for that booking, never the
    account email;
  - providers can see an opaque traveller user ID on their own bookings, which is needed for the
    traveller's own list filter. This is recorded in ADR-0004.
- **Migration:** additive, but it **requires `pg_cron`** on hosted projects (added to DEPLOYMENT).
  Apply it before deploying the code.

## Tests and commands executed

| Command | Result (actual) |
| --- | --- |
| `npx supabase db reset` | Migration applied; `himverse-booking-sweep` scheduled `*/15 * * * *` |
| `npm run db:test` (final, fresh reset) | **PASS: 9 files, 284 assertions** |
| Mutation: providers read all bookings, per-slot unique index dropped, direct status updates allowed | 6 booking assertions failed as expected; reset restored |
| `npm run test:integration` | **3/3 pass** (also 3× in a row earlier): 10 parallel same-key requests → 1 booking; 6 parallel different-key requests → 1 success + 5 × `23505`; 6 parallel confirmations on 3 seats → exactly 3 confirmed, `seats_confirmed = 3` |
| `npm run verify` (final) | **Pass**: **222 unit tests in 18 files**, build |
| `npm run build` without `.env.local` | **Pass** |
| Browser-bundle scan | Clean |
| `npm run test:e2e`, CI-like, fresh DB | **46/46** |
| `npm run test:e2e`, normal, 2× more on the used DB | **46/46** each time |
| `npm audit --omit=dev` / secret scan / links | 0 vulnerabilities / clean / 0 problems |
| Layering checks | No client value imports from `src/server`; no `select("*")`; no `any`; `src/lib` imports nothing above it |
| GitHub CI | **Not run** for these uncommitted changes |

## Build, lint and type-check status

- Format: pass
- Lint: pass
- Typecheck: pass
- Unit tests: pass (222/222)
- Integration tests: pass (3/3)
- Build: pass, with and without environment variables
- E2E: pass (46/46)
- DB tests: pass (284/284)

## Issues found and fixed during implementation

1. **The provider couldn't see the traveller's name**, which you'd approved showing. RLS correctly blocks
   reading profiles. Fixed by snapshotting the display name on the booking.
2. **Bookings would lose their date and title** once a slot closed or passed, or an experience was
   hidden (RLS hides those rows). Fixed with experience-title and slot date/time snapshots.
3. **Integration tests would break the unit job,** which has no database: the unit config included
   `tests/integration`. Split into separate configs and scripts.
4. **Removed customer-facing text:** restoring the "availability isn't guaranteed until the provider
   confirms" notice, which a Phase 2 E2E test covers.
5. **A test-only type error broke the production build,** because Next's build type-checks the whole
   project. It was fixed, and caught by the gate before any commit.
6. **E2E data collisions across local runs** (reused traveller names, a fixed slot date). Tests now use
   unique data per run and assert that adding a date succeeded.
7. Test-only fixes: duplicated note text (asserted the specific line), and a pgTAP ordering issue caused
   by identical `now()` timestamps within one transaction.

## Known issues, limitations, unverified assumptions

- **No notifications.** Providers and travellers must check `/provider/bookings` and `/bookings`.
- **`pg_cron` must be enabled on hosted Supabase projects.** If the sweep isn't running, functions
  still refuse late confirmations and the UI shows overdue requests as expired, but `completed` won't
  be recorded.
- **Children are estimated at the adult price.** The provider sets the final price.
- **The E2E double click proves the UI path:** the button is disabled while pending, and the idempotency
  key is reused. The server-side race is proven separately by the integration tests.
- **Provider membership in E2E** is granted with owner SQL on the local stack, because there's no
  staff-invite flow yet.
- **Open business questions** (payments, late-cancellation and no-show rules, child pricing,
  rescheduling, the response window per category, what happens to confirmed bookings when a provider is
  suspended) are listed in BOOKING_POLICY.
- **CI hasn't run on this change.** It adds a `test:integration` step to the database job.

## Environment variables or manual steps required

- **Locally:** none new. `npx supabase db reset` applies the migration and the seed.
- **Hosted:** enable `pg_cron`, then apply the migration. No new environment variables.

## Follow-up tasks

1. Review and commit (suggested: `feat: phase 4 booking lifecycle`), then push so CI runs, including the
   new integration step.
2. Notifications (an email/SMS provider ADR).
3. Payments, a separate phase with its own ADR, once the open questions are answered.
4. A provider staff-invite flow, so membership doesn't need operator SQL.
