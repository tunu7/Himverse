# Task Report: Online deposits with Razorpay (Phase 5)

- Date: 2026-10-15
- Author: Claude Code (agent), for the product owner
- Branch / commit: `worktree-payments` (separate worktree), not yet merged to main

## Objective and scope

The owner said "start phase 5" and chose **online payments**. This was outside the original MVP scope;
the owner approved it.

Owner decisions:

- Himverse collects payments, and the owner pays partners out manually.
- Travellers pay a **50% deposit** after the partner confirms.
- **Refunds:** full if cancelled 7 or more days ahead, 50% between 7 days and 24 hours.
- The deposit is due within **24 hours**, or the booking is cancelled.
- An admin turns deposits on; they are off by default.
- The owner approved the plan as presented.

Out of scope:

- live keys (Test Mode until the [go-live gate](../../docs/operations/PAYMENTS.md));
- Razorpay Route and automatic payouts;
- commissions;
- full prepayment.

Acceptance criteria:

- Deposits apply only when an admin has turned them on and keys are configured.
- Payment state changes only through a signature-verified webhook or a server-side fetch from
  Razorpay.
- The amount and currency must match the order.
- Every money operation is idempotent: orders, captures, refunds and payouts.
- Refunds follow the owner's tiers.
- Unpaid bookings are cancelled after the deadline.
- Partners' balances are tracked.
- Every step is tested.

## Summary of implementation

- **Database** (`20261015141524_payments`):
  - `platform_settings`, the admin switch;
  - deposit terms set on confirmation, by a trigger, so they also work with the other session's
    price-approval flow;
  - tables `payments`, `refunds`, `payment_events` and `partner_payouts`, with RLS and only some columns
    readable;
  - refunds queued by a cancellation trigger;
  - system-only functions to record payments and refunds, claim refunds, check refunds, reconcile and
    log webhooks;
  - unpaid cancellation every 15 minutes with a 30-minute grace period;
  - held and payable partner balances, and payouts with a unique bank reference.
- **Server:**
  - Razorpay REST client over `fetch`, with no SDK. It validates responses, uses timeouts, compares
    signatures in constant time and sends the `X-Refund-Idempotency` header;
  - checkout start and complete;
  - webhook route that checks the HMAC over the raw body first, deduplicates by event id, retries
    unfinished events and caps the body size;
  - daily cron route that sends refunds, checks sent refunds and reconciles missed webhooks;
  - a narrow system database module, the only user of the secret key.
- **UI:**
  - deposit panel and "Pay deposit" on the booking page, loading Razorpay Checkout only on click,
    reloading once if the page's security policy blocks it, and closing at the deadline;
  - "Deposit due" label on the bookings list;
  - `/admin/payments`: the switch, warnings, balances, the payout form, and open refunds;
  - deposit totals on the partner overview;
  - wording that stays true with deposits on or off; terms and privacy updated.
- **Security headers:** Razorpay's origins, popups and the browser payment API are allowed only on
  `/bookings/:id`.
- **Settings:** `RAZORPAY_*` and `CRON_SECRET`.
  - Live keys are refused unless `RAZORPAY_ALLOW_LIVE=true`.
  - The API address is pinned to Razorpay on Vercel.
  - The local env script now also writes the local stack's secret key, which the system path needs.

## Files

| Change   | Path                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Notes                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| Created  | `supabase/migrations/20261015141524_payments.sql`, `supabase/tests/payments.test.sql` (56)                                                                                                                                                                                                                                                                                                                                                                                                                         | Schema, functions, pgTAP                   |
| Created  | `src/server/payments/{razorpay,system-db,payments,admin}.ts`, `src/app/api/webhooks/razorpay/route.ts`, `src/app/api/cron/payments/route.ts`                                                                                                                                                                                                                                                                                                                                                                       | Server                                     |
| Created  | `src/features/bookings/components/{pay-deposit,deposit-panel}.tsx`, `src/features/admin/components/payment-forms.tsx`, `src/app/admin/payments/page.tsx`                                                                                                                                                                                                                                                                                                                                                           | UI                                         |
| Created  | `tests/unit/payments.test.ts` (16), `tests/e2e/payments.spec.ts`, `tests/e2e/fake-razorpay.mjs`, `docs/operations/PAYMENTS.md`, this report                                                                                                                                                                                                                                                                                                                                                                        | Tests, runbook                             |
| Modified | `src/features/bookings/{actions,schemas}.ts`, `src/features/bookings/components/{booking-detail,booking-forms,listing-booking-form,trip-booking}.tsx`, `src/features/admin/{actions,schemas}.ts`, `src/server/bookings/repository.ts`, `src/app/(site)/{bookings,privacy,terms}/page.tsx`, `src/app/provider/page.tsx`, `src/app/admin/layout.tsx`, `src/lib/{env,env.server}.ts`, `next.config.ts`, `vercel.json`, `playwright.config.ts`, `scripts/write-local-env.mjs`, `.env.example`, `src/types/database.ts` | Integration                                |
| Modified | `supabase/tests/privileges.test.sql` and 10 other pgTAP files                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Snapshot; truncates include the new tables |
| Modified | `docs/decisions/{ADR-0005-PAYMENTS-RAZORPAY,README}.md`, `docs/product/{BOOKING_POLICY,MVP_SCOPE,ROADMAP}.md`, `docs/operations/ENVIRONMENTS.md`, `docs/database/DATABASE_DESIGN.md`, `CLAUDE.md`                                                                                                                                                                                                                                                                                                                  | Docs                                       |
| Deleted  | None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |                                            |

## Architectural and database changes

- **ADR-0005** moves from Proposed to **Accepted**, with the owner's decisions and the review fixes.
- **New tables:** five, all with RLS.
- **Bookings:** three new columns and two new triggers.
- **New public functions:** 14 in total.
  - Callable by travellers, partners and admins: `set_deposits_required`, `deposit_checkout`,
    `partner_payment_summary`, `admin_partner_balances` and `record_partner_payout`.
  - Callable only by the server's system path: the rest.
- **New pg_cron job:** `himverse-unpaid-deposits`.
- **New Vercel Cron:** `/api/cron/payments`, daily at 03:30 UTC.

## Security and migration implications

- **First system path:** the webhook, the cron job and server-verified checkout use the secret key
  through `src/server/payments/system-db.ts`. It is server-only and calls only the payment functions.
- **Independent security review** (security-reviewer agent): it found 1 blocker, which is fixed, and 8
  should-fixes, which are fixed.
  - **Blocker:** a refund could be sent twice when runs overlapped or a request timed out. Fixed with
    an atomic claim (`for update skip locked` and a lease) plus Razorpay's `X-Refund-Idempotency`
    header. I verified the header in Razorpay's docs, which corrected my earlier "receipt"
    assumption.
  - **Should-fixes:**
    - held/payable balances: partners are never paid deposits that may still be refunded;
    - failed refunds and refunds made by hand in the Razorpay Dashboard are counted;
    - unfinished webhook events are processed again;
    - a failed attempt no longer closes an order;
    - orders can be recorded only through the system path;
    - extra payments are flagged;
    - grace period at the deadline;
    - unique payout references.
  - **Nits fixed:**
    - API address pinned;
    - refund amount and id checks;
    - distinct outcome messages;
    - the security-policy fallback after in-app navigation;
    - a warning when deposits are on without keys;
    - accurate comments.
  - **Nits documented:** completion when pg_cron is down; event-id replay only adds log rows.
  - The review found no way to mark a booking paid without real money.
- **Migration:** additive. With deposits off (the default), behaviour is unchanged. Apply it before
  deploying code that reads the new columns.
- **Rollback:** turn deposits off at `/admin/payments`. The tables and functions can stay.

## Tests and commands executed

All tests ran on this branch against a **second local Supabase stack** on ports 553xx, so the other
session's local database wasn't touched.

| Command                                                                                          | Result (actual)                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `supabase db reset` + `supabase test db` (branch stack)                                          | PASS: 20 files, 541 tests                                                                                                                                                |
| `npx vitest run tests/unit`                                                                      | PASS: 374                                                                                                                                                                |
| `npx eslint .` / `npx tsc --noEmit` / `npm run format:check`                                     | Clean                                                                                                                                                                    |
| `npm run build` with no env file (as CI's first build)                                           | PASS                                                                                                                                                                     |
| `npx playwright test tests/e2e/payments.spec.ts --workers=1` (fake Razorpay)                     | PASS                                                                                                                                                                     |
| Full E2E on the branch stack (excluding the 4 email tests that need the default stack's Mailpit) | 66 passed, 2 failed. Both were two-step-login code timing flakes, in `payments` and `listing-types`, during a 15-minute run on an 8 GB machine; re-run alone: 31/31 pass |
| security-reviewer agent                                                                          | 1 blocker and 8 should-fixes, all fixed                                                                                                                                  |

## Build, lint and type-check status

- Format: pass
- Lint: pass
- Typecheck: pass
- Unit tests: pass (374)
- Build: pass
- E2E: payments pass; full suite on the branch stack 66/68, with 2 auth-timing flakes passing on re-run.
  The email specs were not run on the branch stack.
- DB tests: pass (541)

## Known issues, limitations, unverified assumptions

- **Not yet merged:** the branch has not been rebased onto the other session's uncommitted booking work
  (`booking_listing_type`, `booking_price_approval`). Its migrations are timestamped earlier. Deposit
  terms use a status trigger, so its new confirmation path should get deposits too. **Rerun all tests
  after the rebase.**
- **Real Checkout untested:** Razorpay Checkout's security-policy origins aren't documented
  officially. They need checking in Test Mode on the deployed site (go-live gate).
- **Payout rule:** the held/payable rule is an engineering default, pending the owner's confirmation.
- **Hosted cron:** pg_cron and Vercel Cron schedules are only verified on hosted infrastructure.

## Environment variables or manual steps required

Owner steps are in [PAYMENTS](../../docs/operations/PAYMENTS.md) §1:

1. Create a Razorpay Test Mode account; get the key id and secret.
2. Add the webhook URL, events and secret.
3. Add `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` and `CRON_SECRET` in Vercel.
4. After merge, run `supabase db push`, then deploy.
5. Turn deposits on at `/admin/payments`.

## Follow-up tasks

- Rebase onto the price-approval work, then run the full verify, DB and E2E checks, including the email
  specs, on the shared stack.
- Go-live gate: a real Test Mode journey and a console security-policy check.
- Owner confirmation of the payout rule; commissions if wanted.
