# ADR-0005: Payments with Razorpay (design only)

- Status: **Proposed** (no code, SDK or keys; implementation is Phase 5 Workstream C, sandbox only)
- Date: 2026-10-13

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
   acting, it calls one narrowly scoped database function with a dedicated credential. This is the
   first system path; it needs its own review and pgTAP tests, and must not use a general secret-key
   client.
9. **CSP:** Razorpay Checkout loads a script and a frame. Extend `script-src`, `frame-src` and
   `connect-src` only for Razorpay's documented origins, on the payment page if possible.

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
  and a CSP change. Each needs RLS, pgTAP and integration tests in Workstream C.
- Cancellation rules gain money consequences; BOOKING_POLICY questions 1–2 must be answered first.
- Marketplace collection would add KYC, payouts and possibly regulatory requirements: decide before
  implementation.
