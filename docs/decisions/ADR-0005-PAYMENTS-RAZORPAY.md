# ADR-0005: Payments with Razorpay (deposits)

- Status: **Accepted** 2026-10-15 (owner decisions below). Test Mode only until the go-live gate passes.
- Date: 2026-10-13 (proposed); 2026-10-15 (accepted, implemented)
- Implementation: migration `20261015141524_payments`, `src/server/payments/`, `/api/webhooks/razorpay`,
  `/api/cron/payments`, `/admin/payments`; pgTAP `payments.test.sql`, unit `payments.test.ts`, E2E
  `payments.spec.ts` (fake Razorpay API). Runbook: [PAYMENTS](../operations/PAYMENTS.md).

## Context

Launch is **without online payments**: bookings are requests that providers confirm, and nothing is
charged through Himverse.AI ([BOOKING_POLICY](../product/BOOKING_POLICY.md)). The owner chose **Razorpay**
for when payments are added (Indian market, INR, UPI). This ADR fixes the safety rules up front so the
later implementation can't take shortcuts. Razorpay API details below are from general knowledge of its
Orders/Checkout/Webhooks model and **must be verified against Razorpay's current documentation** in
sandbox before any code is merged.

Business questions still open (BOOKING_POLICY 1–2): deposit vs full prepayment, refund schedule per
cancellation timing, and whether Himverse.AI collects as a marketplace (Razorpay Route / payouts to
providers, with the regulatory implications) or each provider collects directly.

## Owner decisions (2026-10-15)

- **Himverse collects** on one Razorpay account. Partners are paid out manually by bank transfer and the
  payouts are recorded (`partner_payouts`); no Razorpay Route.
- **A 50% deposit** online after the partner confirms (rounded up to the paisa); the rest is paid to the
  partner on the day.
- **Deadline:** within 24 hours of confirmation, or by the start if sooner; unpaid bookings are cancelled
  by the system (pg_cron) and their date freed.
- **Refunds of a paid deposit:** traveller cancels 7+ days before the start → full; 7 days to 24 hours →
  50%; partner or system cancellation → full. A payment that arrives for a cancelled or already-paid
  booking is refunded in full.
- **Admin switch:** deposits are required only after an admin turns them on (`platform_settings`), which
  needs the Razorpay keys on the deployment.
- **Payouts (engineering default, confirm with the owner):** a deposit is _held_ while its booking can
  still be refunded (confirmed, upcoming) and becomes _payable_ once the booking is completed, or
  cancelled with its refund decided. Payouts are limited to payable money, so Himverse never pays a
  partner a deposit it may still have to refund.

## Security review (2026-10-15) — fixes

- **Refunds are sent once:** each refund is claimed atomically (`claim_refunds`, `for update skip
locked`, 5-minute lease) before sending, and Razorpay's `X-Refund-Idempotency` header (our refund
  id) makes a retry after a timeout return the same refund. A second Razorpay refund id or a different
  amount for one of ours is flagged, never merged.
- **Webhooks aren't lost:** an event whose processing failed (no result) is processed again on
  Razorpay's retry. The daily job also asks Razorpay about refunds still pending after an hour.
- **A failed attempt doesn't close an order** (Checkout can retry on it), so reconciliation still sees
  it.
- **Orders are recorded only by the server** (`attach_deposit_order` is service-role only, checked
  against the signed-in traveller), so a traveller can't flood reconciliation with invented orders.
- **Grace period:** a checkout started in the 15 minutes before the deadline gets 30 more minutes;
  Checkout also closes itself at the deadline.
- **Payouts** have a unique bank reference per partner, and failed refunds (still owed to the
  traveller) are subtracted from what a partner is owed. Refunds made by hand in the Razorpay Dashboard
  are recorded from their webhook.
- **A second payment on an already-paid order** (Razorpay shouldn't allow it) is logged
  (`payments.extra_payment`) for a manual refund.
- **The API address** is pinned to `https://api.razorpay.com` on Vercel.
- **Known limit:** if pg_cron stopped for a day, the completion sweep could mark an unpaid booking
  completed. Both jobs run every 15 minutes in the same scheduler; the go-live gate checks
  `cron.job_run_details`.

## Decision

1. **Pay after provider confirmation.** A payment can only be created for a `confirmed` booking, for
   the provider-confirmed total. No seats are held by an unpaid request (unchanged from ADR-0004).
2. **The server creates the Razorpay order.** Amount (integer paise) and currency come from the
   database row, never from the client. The order is stored in a `payments` row (`created`) keyed by
   booking with an idempotency key, so retries reuse the same order.
3. **A browser redirect or Checkout callback never marks anything paid.** The client callback's
   `payment_id`/`order_id`/`signature` is verified server-side (HMAC-SHA256 with the key secret) only to
   show "payment processing". The authoritative state change comes from:
   - a **webhook** whose signature is verified with HMAC-SHA256 over the **raw request body** using the
     webhook secret, compared in constant time, before any parsing; or
   - a server-side fetch of the payment/order from the Razorpay API (reconciliation).
4. **Idempotent processing.** Every webhook is stored in `payment_events` with a unique provider event
   id (`on conflict do nothing`) before processing. Duplicates and out-of-order deliveries are expected.
   State transitions are monotonic and enforced in a `security definer` function:
   `created → authorized → captured`, `→ failed`, `captured → partially_refunded | refunded`. The amount
   and currency in the event must equal the stored order, or the event is quarantined and alerted.
5. **Refunds** are initiated only server-side, from the cancellation rules, with an idempotency key per
   refund, and are recorded from refund webhooks (`processed`/`failed`). Never refund from a client
   request directly.
6. **Reconciliation:** a daily scheduled job compares captured payments and refunds in Razorpay with
   the database for the previous days and reports mismatches (alert, no automatic fixes).
7. **Secrets:** `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` are server-only, via
   `env.server.ts`; `RAZORPAY_KEY_ID` may be public. Test keys only on staging; live keys only in
   production after the go-live gate below.
8. **Webhook handler:** a Route Handler at `/api/webhooks/razorpay` (no session). Because no user is
   acting, it uses the Supabase secret key through `src/server/payments/system-db.ts`, which exposes only
   the payment functions granted to `service_role` (no table access). Implemented as the first system
   path, with its own pgTAP and unit tests.
   - Orders: a new order per checkout attempt (Razorpay's rule), reusing an unpaid one from the last 30
     minutes; the receipt `<booking reference>-<attempt>` is Razorpay's duplicate guard.
   - Refunds: the refund row's id is the Razorpay `receipt`, so a retried refund can't be created twice.
9. **CSP:** only on `/bookings/:id` (the traveller's booking page): `script-src` and `frame-src`
   `checkout.razorpay.com`/`api.razorpay.com`, `connect-src` `api.razorpay.com` and
   `lumberjack.razorpay.com`, `Cross-Origin-Opener-Policy: same-origin-allow-popups` (bank/UPI popups)
   and `payment=(self)`. Razorpay publishes no official origin list; the go-live gate checks the console.

## Go-live gate for live keys

All in sandbox/staging, with evidence: signature verification tests (valid, tampered body, wrong
secret, replay); duplicate and out-of-order webhook tests; amount-mismatch quarantine; a full
pay → capture → cancel → refund journey; reconciliation report on test data; runbook for failed
webhooks and manual refunds; owner sign-off. **No live credentials before this passes.**

## Alternatives considered

- **Stripe** (Vercel Marketplace's default payments integration): strong tooling, but the owner chose
  Razorpay for Indian payment methods (UPI) and settlement. Not chosen.
- **Pay at provider only** (current launch state): simplest and no payment liability, but no deposits
  and no protection against no-shows. Kept for launch.
- **Payment links sent manually by providers:** no integration, but no reliable booking ↔ payment
  link. Not chosen for the platform.

## Consequences

- New tables (`payments`, `payment_events`, refunds), a webhook route, a scheduled reconciliation job
  and a CSP change, each with RLS and tests (done; see the implementation line above).
- Cancellation rules gain money consequences; BOOKING_POLICY questions 1–2 must be answered first.
- Marketplace collection would add KYC, payouts and possibly regulatory requirements: decide before
  implementation.

## Amendment (2026-10-29): deposits with instant booking

Owner decision, with ADR-0004's instant-booking amendment (migration `20261029150442_instant_booking`).

- With deposits required, an instant booking is `confirmed` with 50% due **within 1 hour** (or by the
  start, if sooner) instead of 24 hours: the booking holds capacity from the moment it is made.
  Partner-confirmed requests (listings without a price) keep 24 hours.
- The unpaid-deposit sweep (`himverse-unpaid-deposits`) now runs **every 5 minutes**. With the existing
  30-minute grace for a checkout in progress, an unpaid instant booking is cancelled 1 to about
  1 h 35 min after it was made, and its capacity is freed.
- With deposits off, an instant booking is confirmed with nothing to pay online (paid on the day).
- Refund tiers, webhook handling and payouts are unchanged.
