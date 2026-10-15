# Task Report: Professional dashboards for travellers, partners and admins

- Date: 2026-10-15
- Author: Claude Code (agent)
- Branch / commit: main / uncommitted (base 381d6ba)

## Objective and scope

The owner reported "login is not working properly". They also asked for "the dashboard for travellers,
partners and admin [to] feel professional with working and essential features". The plan, approved by
the owner, covered all three dashboards.

**Login diagnosis:**

- **Cause:** production runs commit `381d6ba`, but none of the four new migrations were applied.
- **Evidence:** the production logs show `auth.account_lookup_failed` with error `42703`
  (`profiles.account_type` doesn't exist) and `auth.choose_account_type_failed`.
- **Fix:** the owner runs `supabase db push`. No code change is needed, and the agent may not push
  production migrations (CLAUDE.md rule 9).

## Summary of implementation

**Shared**

- The portal frame has a sidebar on desktop and scrolling tabs on mobile.
- New dashboard building blocks: stat cards, panel, setup checklist, URL-driven filter tabs and an
  empty state.

**Partner portal** (`/provider`)

- **Overview:** stats for needs-response (with the next deadline), upcoming bookings, confirmed
  revenue this month and live listings. A setup checklist and quick actions.
- **Listings:** `/provider/listings` lists them with status, bookings on/off, publish and unpublish,
  and an add form. Each listing has a full edit page at `/provider/listings/[id]` covering details,
  publish, archive and dates with limited seats.
- **Booking requests:** tabs for Needs response, Upcoming, Past and All, each with a count.
- **Business profile:** `/provider/business` edits the public profile and legal/contact details. Both
  are locked when the database rules lock them.

**Traveller** (`/account`)

- **Overview:** next booking, stats (upcoming, awaiting reply, trip plans, all bookings) and recent
  trip plans.
- **Bookings:** tabs for All, Upcoming, Awaiting reply, Past and Cancelled.
- **Shared tabs** across Overview, Trip plans, Bookings and Settings. Settings moved to
  `/account/settings`.

**Admin**

- **Overview:** adds overdue requests and accounts by type.
- **Users (new):** `/admin/users` searches by email or name, filters by type and pages through results.
  Each row shows business, email confirmation, two-step status, join date and last sign-in. It reads
  through the new `admin_list_users` function (migration `20261015002725`), which is security definer,
  read-only and limited to aal2 admins. LIKE wildcards are escaped.

## Files

- **Created:**
  - `src/components/dashboard.tsx`
  - `src/server/providers/partner.ts`
  - `src/features/providers/components/partner-forms.tsx`
  - `src/features/account/components/traveller-tabs.tsx`
  - `src/app/provider/{listings,listings/[id],business}/page.tsx`
  - `src/app/(site)/account/settings/page.tsx`
  - `src/app/admin/users/page.tsx`
  - `supabase/migrations/20261015002725_admin_users_list.sql`
  - `supabase/tests/admin_users.test.sql`
- **Modified:**
  - portal shell and nav;
  - provider and admin layouts;
  - `/provider`, `/provider/bookings`, `/account`, `/bookings` and `/itineraries` pages;
  - `src/server/admin/admin.ts`;
  - provider actions and schemas;
  - the site header menu;
  - E2E specs for the moved pages.

## Security and migration implications

- One new function: admin-only, aal2 required, read-only, and its grants are pinned by
  `privileges.test.sql`.
- Partner edits go through existing RLS: members only, and profile and detail locks by status.
- No permissions changed.

## Tests and commands executed

| Command                           | Result                                                                                                                                                                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run db:test`                 | 401 passed (15 files)                                                                                                                                                                                                  |
| `npm run typecheck`, `eslint`     | Clean                                                                                                                                                                                                                  |
| `npm run test:e2e -- --workers=1` | See the addendum. The first parallel runs were invalid: the 8 GB machine hit load average 37 and ~66 MB free memory, so they timed out. Leftover data from a timed-out run (a console fixture) also had to be removed. |

## Known issues, limitations, unverified assumptions

- A partner account with several businesses sees only the first one (the app creates one per
  account).
- "Confirmed this month" is the sum of partner-confirmed totals. No payment is taken.

## Environment variables or manual steps required

The owner runs `supabase db push`, which now has 5 pending migrations. Then they apply the dashboard
auth settings from ENVIRONMENTS and redeploy.

## Follow-up tasks

- Phase 3: partner listing types.

## Addendum: test results

- **E2E** (`--workers=1`, after removing the leftover fixture): 61 of 62 passed. The one failure was a
  test race: it reloaded before the "Save as draft" action finished. The test now waits for the new
  row, and `provider-lifecycle.spec.ts` passes.
- **Timeout:** the lifecycle test's limit was raised from 120 s to 240 s (two two-step sign-ups on a
  slow machine).
