# Task Report: MVP hardening — booking listing type, price approval, Turnstile CAPTCHA, transport E2E

- Date: 2026-10-15
- Author: Claude Code (agent)
- Branch / commit: main / uncommitted (base b24c300)

## Objective and scope

The owner asked to "do everything step by step" from the MVP optimisation list. These are the items an
agent can do without the owner's accounts. Two decisions were made by the owner before work started:

- **Price rule:** up to 10% above the estimate confirms directly. More than that, or a total with no
  estimate, needs the traveller's approval.
- **CAPTCHA:** Cloudflare Turnstile, built behind a flag that stays off until the owner adds the keys.

| Step | Acceptance criteria                                                                                                                                                                                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Bookings store their listing type at insert. It never changes, and stays readable after the listing is hidden.                                                                                                                                   |
| 2    | Above the threshold, the partner's total becomes a proposal and nothing is confirmed. The traveller accepts (availability re-checked) or cancels within 48 h, or the request expires. Retries are idempotent. Covered in DB, unit and E2E tests. |
| 3    | Every Supabase password check can carry a Turnstile token (sign-in, sign-up, forgot password, resend, change password, delete account). The widget appears only with a site key. CSP is extended only then. No secret is held in the app.        |
| 4    | An E2E test covers a transport leg in an AI plan and its whole-trip booking.                                                                                                                                                                     |

Out of scope:

- Everything that needs the owner's accounts: production pushes, SMTP, Sentry, backups, staging, and
  switching CAPTCHA on.

## Summary of implementation

**Step 1.** `bookings.listing_type` is set by the `bookings_c_listing_type` trigger from the
experience at insert, and the trigger refuses changes. Existing rows were backfilled. The repository
reads the column directly instead of embedding the experience, so `BookingSummary.listingType` is no
longer nullable.

**Step 2.**

- New columns `proposed_total_minor` and `price_proposed_at`.
- `private.price_needs_approval` is an integer check: more than 10% above the estimate, or no estimate.
- `private.confirm_booking` holds the confirmation logic taken out of `respond_to_booking`. It locks the
  booking and re-checks that its status is `requested`.
- `respond_to_booking` now does one of three things:
  - confirms directly;
  - proposes a price (status stays `requested`, expiry resets to 48 h or the start if sooner, returns
    `requested`, and a retry with the same total replays);
  - declines.
- New `accept_booking_price` for the traveller: the total must match the proposal, a retry after success
  replays, and provider, listing, date and capacity are re-checked.
- The sweep notes when a proposal expired. Partner alerts don't count proposals as waiting on the
  partner.
- UI:
  - traveller: a "New price to approve" panel with an Accept button; declining is cancelling the request;
  - partner: a waiting note with a decline-only form, and a "Price sent" tab;
  - status badge: "New price awaiting approval".

**Step 3.**

- `src/components/captcha-field.tsx` renders the Turnstile widget explicitly, with no new dependency.
  The widget writes its token into a hidden `captchaToken` input, and the component resets it after each
  submission.
- `captchaTokenField` is added to the five auth and account schemas.
- The token is passed as `options.captchaToken` on every Supabase call that checks a password.
- `captcha_failed` is mapped to "Please complete the security check". It is never counted as a wrong
  password.
- The CSP allows `challenges.cloudflare.com` only when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set at build
  time.
- The privacy page names Cloudflare Turnstile.
- ADR-0010.

**Step 4.** `tests/e2e/itinerary-transport.spec.ts` sets up its own fixture: a region with two
destinations, one experience at each and a vehicle in each direction. The mock model moves base on day 2. The test checks the transport line, the whole-trip booking line and the resulting booking (1 vehicle,
₹4,500). The fixture is hidden again afterwards.

**Tooling.** Another session keeps a git worktree inside this folder (`.claude/worktrees/payments`).
That folder is now excluded in `.prettierignore`, `eslint.config.mjs` and `tsconfig.json`, so its files
don't break `verify` here.

## Files

| Change   | Path                                                                                                                                                                      | Notes                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Created  | `supabase/migrations/20261016140505_booking_listing_type.sql`, `supabase/migrations/20261016140720_booking_price_approval.sql`                                            | Steps 1–2                              |
| Created  | `supabase/tests/booking_listing_type.test.sql` (6), `supabase/tests/booking_price_approval.test.sql` (28)                                                                 | pgTAP                                  |
| Created  | `src/components/captcha-field.tsx`, `src/lib/captcha.ts`, `docs/decisions/ADR-0010-CAPTCHA-TURNSTILE.md`                                                                  | Step 3                                 |
| Created  | `tests/unit/captcha.test.ts` (14), `tests/e2e/itinerary-transport.spec.ts`                                                                                                | Tests                                  |
| Modified | `src/server/bookings/repository.ts`, `src/features/bookings/{actions,schemas}.ts`, `components/{booking-detail,booking-forms,booking-status}.tsx`                         | Price approval UI and actions          |
| Modified | `src/app/provider/bookings/page.tsx`, `src/app/(site)/{bookings,account,privacy}/page.tsx`                                                                                | Badges, "Price sent" tab, privacy page |
| Modified | `src/features/auth/{actions,schemas}.ts`, `components/{auth-forms,password-forms}.tsx`, `src/features/account/{schemas.ts,components/delete-account-form.tsx}`            | CAPTCHA token                          |
| Modified | `src/server/auth/{auth-errors,passwords,account-deletion}.ts`, `src/lib/env.ts`, `next.config.ts`, `.env.example`                                                         | CAPTCHA token and CSP                  |
| Modified | `src/types/database.ts`, `supabase/tests/privileges.test.sql`, `tests/unit/bookings.test.ts`, `tests/e2e/bookings.spec.ts`                                                | Types, snapshot, tests                 |
| Modified | `.prettierignore`, `eslint.config.mjs`, `tsconfig.json`                                                                                                                   | Ignore nested worktrees                |
| Modified | ADR-0004 (amendment), ADR-0007, decisions README, BOOKING_POLICY, USER_FLOWS, MVP_SCOPE, ROADMAP, DATABASE_DESIGN, ENVIRONMENTS, RELEASE_CHECKLIST, SECURITY, `CLAUDE.md` | Docs                                   |

## Architectural and database changes

- **Bookings:** three new columns (`listing_type`, `proposed_total_minor`, `price_proposed_at`) and one
  constraint (`bookings_proposal_complete`).
- **Functions:**
  - new: `private.set_booking_listing_type`, `private.price_needs_approval`, `private.confirm_booking`,
    `public.accept_booking_price`;
  - replaced: `respond_to_booking`, `sweep_bookings`, `partner_booking_alerts`.
- **Tables and RLS:** no new tables, and RLS is unchanged. The new columns are readable through the
  existing table-level select grant. There are no write grants.
- **Decision records:** ADR-0004 amendment and ADR-0010.

## Security and migration implications

**Independent security review** (`security-reviewer` agent) of Steps 1–2: no blockers.

- S1, fixed: a retried proposal errored. It now replays.
- S2, fixed: `confirm_booking` now locks the booking and re-checks its status. `security definer` was
  dropped, since only definer callers use it.
- N1, fixed: added denied-path tests:
  - a partner at aal1 can't propose;
  - a partner can't accept on the traveller's behalf;
  - a partner can decline while a proposal is open;
  - a proposal never outlasts the start;
  - a suspended provider can't be accepted.
- N3, fixed: partners now have a decline-only form while a proposal is open.
- N2, accepted and documented: a request stays open at most about 96 h, with one proposal per request.
- N4, not done: the proposal path doesn't soft-check capacity. Capacity is checked when the traveller
  accepts.
- N5, accepted: the backfill bumps `updated_at`. Alerts use events, so nothing depends on it.

**Migration notes**

- `20261016140720` was edited after it was applied locally. It hasn't been applied to any shared
  environment. The final file was proven to apply cleanly in a rolled-back transaction, and the changed
  functions were re-applied locally.
- Both migrations are backward compatible with the deployed code. Old code ignores the new return value.
  Between pushing the migrations and deploying, a partner using the old UI who enters a total more than
  10% above the estimate sees no confirmation, and the traveller has no Accept button until the new code
  is live. So deploy right after pushing.

**CAPTCHA**

- There is no secret in the app; the secret lives in Supabase.
- The rollout order matters and is documented in ENVIRONMENTS: deploy the site key first, then enable
  CAPTCHA in Supabase.
- Rollback: turn CAPTCHA off in Supabase.

## Tests and commands executed

| Command                                                                                                    | Result (actual)                                                                               |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `npm run db:test` (final)                                                                                  | PASS: 21 files, 519 tests                                                                     |
| Migration replay in a rolled-back transaction (psql)                                                       | "migration applied cleanly"                                                                   |
| `npm run verify` (final)                                                                                   | Pass: format, lint, typecheck, 27 files / 379 unit tests, build                               |
| `npx playwright test --workers=1` (final, after `npm run build`)                                           | 76 passed (6.9 min)                                                                           |
| Temporary E2E with Turnstile test key `1x00000000000000000000AA` (build with key; spec deleted afterwards) | Passed: widget rendered, token posted as `captchaToken`, sign-up succeeded, no CSP violations |
| Rebuild without the key                                                                                    | Test key absent from `.next/static`                                                           |

## Build, lint and type-check status

- Format: pass
- Lint: pass
- Typecheck: pass
- Unit tests: pass (379)
- Build: pass
- E2E: pass (76)
- DB tests: pass (519)

## Known issues, limitations, unverified assumptions

- **CAPTCHA:** Supabase's enforcement wasn't tested end to end, because local `[auth.captcha]` was left
  off so the shared local stack wasn't restarted. The token reaching Supabase was verified, and
  `captcha_failed` handling is unit-tested.
- **Admin console:** it still labels proposals "Awaiting provider confirmation". It uses its own query,
  which doesn't select the proposal yet.
- **Email:** travellers learn about a proposal only from in-app alerts until email notifications exist.
- **Payments:** another session (`himverse-94`) is building online payments on a separate branch. MVP
  scope currently lists online payments as out of scope until ADR-0005 is accepted. That needs the
  owner's call.

## Environment variables or manual steps required

1. `npx supabase db push --linked` (it now includes `booking_listing_type` and
   `booking_price_approval`), then deploy straight away.
2. When ready for CAPTCHA, follow ENVIRONMENTS → "CAPTCHA (Turnstile)":
   - create a Turnstile widget;
   - set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in Vercel and redeploy;
   - **then** enable CAPTCHA in Supabase with the secret.

## Follow-up tasks

- Show proposals in the admin console.
- Optionally soft-check capacity before saving a proposal (review N4).
- Email notifications for proposals, once a sending domain exists.

## Integration onto main (2026-10-16)

This work was committed locally on an older `main` (b24c300), and the push was rejected. It was
re-applied on top of payments and guides (1058f74):

- **Migrations re-timestamped** to `20261016140505_booking_listing_type` and
  `20261016140720_booking_price_approval`, so they sort after the migrations already in production.
  Neither migration redefines a function changed by payments or guides.
- **Conflicts resolved:**
  - booking summaries carry both `listingType` and `deposit`;
  - the CSP allows both Turnstile and Razorpay;
  - the privacy page lists both;
  - the compact docs gained the Turnstile env row, the CAPTCHA steps and the price-approval rule.
- **New pgTAP check:** with deposits on, an accepted proposal gets a 50% deposit and a payment
  deadline.
- **Results** (each command run on 2026-10-16):

| Command | Result |
| --- | --- |
| `supabase db reset` + `supabase test db` (branch stack) | Pass: 23 files, 593 tests |
| `npm run verify` | Pass: 402 unit tests; build OK; lint shows 2 warnings, 0 errors |
| `npm run test:e2e` | 76/77. Forgot-password failed only because its Mailpit port is hard-coded to the main stack's 54324; it passed when pointed at this stack's 55324 |
