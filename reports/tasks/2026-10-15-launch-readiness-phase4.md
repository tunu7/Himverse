# Task Report: Launch readiness (Phase 4)

- Date: 2026-10-15
- Author: Claude Code (agent), for the product owner
- Branch / commit: main / uncommitted

## Objective and scope

The owner asked for "start phase 4" and chose **launch readiness**: the remaining
[RELEASE_CHECKLIST](../../docs/operations/RELEASE_CHECKLIST.md) work that needs no outside account, plus
**Sentry** (owner's account) and **self-serve account deletion**.

Out of scope, because each needs an account or decision from the owner:

- email notifications (no sending domain yet);
- CAPTCHA;
- a staging project;
- legal review;
- removing sample content.

Acceptance criteria:

- Automated WCAG 2.1 AA checks pass on every area, in light and dark themes.
- Travellers and partners can delete their own account after a fresh sign-in. Partners keep anonymised
  past bookings, and the database enforces every rule.
- Partners see requests waiting for a reply on every portal page, and travellers see partner replies.
- Privacy and terms pages are published and linked from sign-up and the footer.
- The dependency and secret audit is clean or has documented exceptions, and a performance baseline is
  recorded.

## Summary of implementation

- **Accessibility:** `tests/e2e/accessibility.spec.ts` runs axe-core across the public pages, auth,
  legal, traveller, partner and admin areas. Fixes:
  - the admin sidebar links were almost invisible (white on light);
  - the logo accent had low contrast on the dark admin bar and the auth panel;
  - inline links relied on colour alone, so they are now underlined;
  - the admin filter counts had low contrast.

  The manual checklist is in [ACCESSIBILITY](../../docs/engineering/ACCESSIBILITY.md).

- **Account deletion** ([ADR-0009](../../docs/decisions/ADR-0009-ACCOUNT-DELETION-AND-ALERTS.md)):
  - a "Delete account" section in the traveller and partner settings, and an `/account-deleted` page;
  - `delete_my_account()` requires a fresh sign-in (from the JWT's `amr`). It also:
    - requires the second step when an authenticator is enrolled;
    - refuses admins;
    - refuses the last member of a business with open bookings, and stops a memberless business from
      taking bookings;
    - cancels open and upcoming trips through `cancel_booking`;
    - deletes the login.
  - A trigger anonymises bookings on every deletion path.
- **In-app booking alerts:**
  - partners get a bar on every portal page (waiting and expiring requests) and a menu count;
  - travellers get a menu count, plus a status line and "Updated" labels on My bookings, cleared after
    viewing.
- **Legal:** `/privacy` and `/terms` describe how the platform works today. They are linked from the
  footer and the sign-up form. The optional `NEXT_PUBLIC_SUPPORT_EMAIL` sets the contact line.
- **Audit and performance:**
  - production dependencies have 0 advisories; the dev-only `braces` advisory is accepted;
  - the repository and browser bundle are clean of secrets;
  - first load is about 200 KB of compressed JavaScript, with a 0.4–0.56 s time to first byte.
- **Sentry:** the Vercel Marketplace install is waiting for the owner to accept Sentry's terms. No SDK
  code has been added yet.

## Files

| Change   | Path                                                                                                                                                                                                                                                                                                                                  | Notes                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Created  | `supabase/migrations/20261015123702_account_deletion.sql`, `supabase/migrations/20261015125458_booking_alerts.sql`                                                                                                                                                                                                                    | Deletion, anonymisation, alerts |
| Created  | `supabase/tests/account_deletion.test.sql` (24), `supabase/tests/booking_alerts.test.sql` (10)                                                                                                                                                                                                                                        | pgTAP                           |
| Created  | `src/server/auth/account-deletion.ts`, `src/server/bookings/alerts.ts`                                                                                                                                                                                                                                                                | Server logic                    |
| Created  | `src/features/account/components/delete-account-form.tsx`, `src/features/bookings/components/{mark-bookings-seen,partner-alert-bar}.tsx`, `src/features/legal/components/legal-page.tsx`                                                                                                                                              | UI                              |
| Created  | `src/app/(site)/{account-deleted,privacy,terms}/page.tsx`                                                                                                                                                                                                                                                                             | Pages                           |
| Created  | `tests/e2e/{accessibility,account-deletion,booking-alerts}.spec.ts`, `tests/unit/account-deletion.test.ts`                                                                                                                                                                                                                            | Tests                           |
| Created  | `docs/decisions/ADR-0009-ACCOUNT-DELETION-AND-ALERTS.md`, `docs/engineering/ACCESSIBILITY.md`, this report                                                                                                                                                                                                                            | Docs                            |
| Modified | `src/server/auth/passwords.ts` (`verifyCurrentPassword`, `reauthenticateWithPassword`), `src/server/bookings/repository.ts` (partner list keeps anonymised bookings), `src/features/account/*`, `src/features/bookings/{actions.ts,components/booking-detail.tsx}`, `src/app/(site)/bookings/page.tsx`, `src/app/provider/layout.tsx` | Features                        |
| Modified | `src/components/{site-header,account-menu,site-footer}.tsx`, `src/features/portal/components/{portal-nav,portal-shell}.tsx`, `src/app/(auth)/layout.tsx`, `src/app/admin/providers/page.tsx`, `src/app/(site)/experiences/[slug]/page.tsx`, `src/features/auth/components/auth-forms.tsx`                                             | Alerts, accessibility, legal    |
| Modified | `src/lib/env.ts`, `.env.example`, `src/types/database.ts`, `package.json`/`package-lock.json` (`@axe-core/playwright` 4.13.0, dev only)                                                                                                                                                                                               | Config                          |
| Modified | `supabase/tests/privileges.test.sql`, `tests/e2e/support.ts` (`currentTotp`)                                                                                                                                                                                                                                                          | Tests                           |
| Modified | `CLAUDE.md`, `docs/{product/ROADMAP,product/BOOKING_POLICY,operations/RELEASE_CHECKLIST,operations/ENVIRONMENTS,engineering/OBSERVABILITY,engineering/TESTING_STRATEGY,architecture/TECH_STACK,database/DATABASE_DESIGN}.md`, `docs/decisions/README.md`                                                                              | Docs                            |
| Deleted  | None                                                                                                                                                                                                                                                                                                                                  |                                 |

## Architectural and database changes

- **Bookings:**
  - `bookings.traveler_id` is now nullable with `on delete set null`;
  - the phone check allows an empty phone only when the traveller is gone;
  - a new trigger, `bookings_anonymise_on_traveller_removed`.
- **Profiles:** new column `profiles.bookings_seen_at`.
- **New public functions:** `delete_my_account`, `my_booking_updates`, `mark_bookings_seen`,
  `partner_booking_alerts`.
- **New private functions:** `anonymise_booking`, `signed_in_recently`.
- **ADR:** ADR-0009.

## Security and migration implications

An independent security review (security-reviewer agent) found **1 blocker** and 5 should-fixes. All
are fixed:

- **Blocker:** deletion could be done by calling the database function directly with a stolen token,
  skipping the app's password check. The function now requires a sign-in within the last 15 minutes from
  the signed JWT, and the app refreshes the session (authenticator code or password). Tested: a token
  without, or with an old, sign-in time is refused.
- **Partner list:** the partner booking list hid anonymised bookings, because `neq` excluded the null
  traveller. Fixed with `or(is.null, neq)`.
- **Data left behind:** pickup details, the traveller's own cancellation reasons and history notes were
  kept. They are now removed.
- **Race:** a booking created mid-deletion could escape cancellation, and two co-members could leave at
  once. Fixed with row locks on the user and their businesses.
- **Other deletion paths:** deleting a user from the dashboard kept their personal data. A trigger now
  anonymises on every path.
- **Memberless business:** a business left without members kept taking bookings. Its listings now stop
  accepting them.

From the nits, also done:

- sign-in methods are allow-listed;
- refusals are mapped by the database `hint`, not the message text;
- the privacy page mentions the auth logs.

**Migration compatibility:** additive. The deployed code never reads a null `traveler_id`, and the
alerts functions are new. Apply the migrations before deploying the code (the header queries the
alerts functions).

**To verify on production (owner):** the hosted `postgres` role must be allowed to delete from
`auth.users`. Test this once with a throwaway traveller account after the push.

## Tests and commands executed

| Command                                        | Result (actual)                                                      |
| ---------------------------------------------- | -------------------------------------------------------------------- |
| `npx supabase db reset` then `npm run db:test` | PASS: 19 files, 485 tests                                            |
| `npm run verify`                               | PASS: format, lint, typecheck, 358 unit tests, build                 |
| `npx playwright test --workers=1`              | PASS: 74 tests (includes 34 axe scans)                               |
| `npm audit --omit=dev` / `npm audit`           | 0 production advisories / 5 high in dev-only lint tooling (accepted) |
| Secret scan (repository, `.next/static`)       | Clean (one deliberately fake value in a unit test)                   |
| Production page weight (curl)                  | About 180–215 KB JS, 14 KB CSS, 0.40–0.56 s TTFB                     |
| security-reviewer agent                        | 1 blocker and 5 should-fixes, all fixed (above)                      |

## Build, lint and type-check status

- Format: pass
- Lint: pass
- Typecheck: pass
- Unit tests: pass (358)
- Build: pass
- E2E: pass (74, one worker)
- DB tests: pass (485)

## Known issues, limitations, unverified assumptions

- **Notifications:** email is still missing (needs a sending domain). In-app alerts only help people
  who open the site.
- **Sentry:** not installed until the owner accepts the terms.
- **Legal pages:** these describe the product faithfully but have not been reviewed by a lawyer (DPDP).
- **Owner deletions:** a user deleted outside the app has their bookings anonymised, but their open
  requests are not cancelled.
- **Accessibility:** automated checks don't replace the manual keyboard and screen-reader pass.

## Environment variables or manual steps required

1. Run `npx supabase db push --linked` (2 migrations) **before** deploying the code.
2. Optionally set `NEXT_PUBLIC_SUPPORT_EMAIL` in Vercel and redeploy.
3. Accept the Sentry terms:
   https://vercel.com/tunus-projects/~/integrations/accept-terms/sentry?source=cli. Then the install
   and SDK setup can continue.

## Follow-up tasks

- Sentry SDK setup and the CSP `connect-src` change, after the terms are accepted.
- Email notifications once a domain exists; CAPTCHA (Turnstile).
- A manual accessibility pass; legal review of `/privacy` and `/terms`.
