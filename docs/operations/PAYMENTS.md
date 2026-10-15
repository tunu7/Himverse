# Payments runbook (Razorpay deposits)

Design: [ADR-0005](../decisions/ADR-0005-PAYMENTS-RAZORPAY.md). Rules: [BOOKING_POLICY](../product/BOOKING_POLICY.md).
Deposits are **off** until an admin turns them on at `/admin/payments`. Without keys they can't be turned on.

## 1. Set up in Test Mode (owner)

1. **Create a Razorpay account** at razorpay.com. Test Mode works straight away, without KYC.
2. **Get the keys:** in the Dashboard (Test Mode), go to Account & Settings → API Keys and generate a key.
   You get a **Key Id** (`rzp_test_…`) and a **Key Secret**. The secret is shown once.
3. **Add the webhook:** in Account & Settings → Webhooks → Add, enter:
   - URL: `https://<your site>/api/webhooks/razorpay`;
   - a strong **secret** that you choose;
   - events: `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`, `refund.failed`.
4. **Add the environment variables in Vercel** (Production and Preview), then redeploy:
   - `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`;
   - `CRON_SECRET`, a random string of 16+ characters. Vercel Cron sends it to `/api/cron/payments`
     daily at 03:30 UTC.

   Never put them in `NEXT_PUBLIC_` variables or share them in chat.

5. **Check the capture setting:** under Account & Settings → Payment Capture, keep **automatic capture**
   (Razorpay's default). Deposits count only when captured.
6. **Turn deposits on:** go to `/admin/payments` → **Require deposits**. Only bookings confirmed from then
   on need a deposit.

## 2. What happens automatically

| When                                                              | What happens                                                                                                                                       | Where                                      |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| A partner confirms (or a traveller accepts a proposed price)      | Deposit = 50% of the confirmed total, due within 24 h or by the start                                                                              | `bookings_c_deposit_terms` trigger         |
| The traveller pays                                                | Checkout → the server checks the signature and asks Razorpay → recorded as paid                                                                    | `completeDepositCheckout`                  |
| Razorpay sends `payment.captured`                                 | Recorded once (deduplicated by event id); amount and currency must match                                                                           | `/api/webhooks/razorpay`                   |
| The deposit is unpaid at the deadline                             | The booking is cancelled by the system and its date freed                                                                                          | pg_cron `himverse-unpaid-deposits`, 15 min |
| A paid booking is cancelled                                       | A refund is queued (full ≥ 7 days, 50% 1–7 days, full for a partner or system cancellation), claimed once and sent with Razorpay's idempotency key | trigger + cancel action + daily cron       |
| A payment arrives after cancellation, or a second payment arrives | It's refunded in full                                                                                                                              | `record_razorpay_payment`                  |
| Daily                                                             | Sends queued refunds; completes sent refunds still pending after an hour; asks Razorpay about unpaid orders from the last 3 days (missed webhooks) | `/api/cron/payments`                       |
| A checkout starts within 15 minutes of the deadline               | The booking gets 30 more minutes before it can be cancelled                                                                                        | `cancel_unpaid_bookings`                   |

## 3. Paying partners

Deposits land in Himverse's Razorpay account and settle to its bank account. A deposit is **held**
while its booking can still be refunded (confirmed and upcoming). It becomes **payable** once the trip
is completed, or the booking is cancelled and its refund decided.

On `/admin/payments`, each partner shows **Owed**: payable deposits minus refunds (sent, pending or
failed) minus payouts.

1. Transfer that amount from Himverse's bank account.
2. Record it with **Record payout**, giving the amount and the bank reference (UTR).

A payout can't be more than the amount owed, and a bank reference can be recorded only once per
partner. Partners see collected, held, paid-out and owed amounts on their portal overview.

_This held/payable rule is an engineering default. Tell the developer if you'd rather pay partners
earlier (for example at confirmation) and accept the refund risk._

## 4. When something goes wrong

- **A refund is "Failed at Razorpay"** (on `/admin/payments`): refund it manually in the Razorpay
  Dashboard (Payments → the payment → Refund), then tell the traveller. Its `refund.processed` webhook
  records it here automatically.
- **"payments.refund_needs_review"** in the logs: Razorpay reported a refund we can't match (a second
  refund id, or a different amount). Compare the payment's refunds in the Dashboard with
  `/admin/payments`.
- **"payments.extra_payment"** in the logs: a second payment arrived on an order that was already
  paid. Refund that payment in full from the Dashboard.
- **"payments.amount_mismatch"** in the logs: a payment's amount or currency didn't match its order. It
  was not marked as paid. Check the payment in the Dashboard, then refund it or contact Razorpay.
- **A traveller says they paid but the booking shows unpaid:**
  1. Find the payment in the Dashboard.
  2. If it's captured, the daily job records it (orders from the last 3 days). To fix it at once, run
     the cron URL with the secret:
     `curl -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/cron/payments`.
  3. If the booking was already cancelled for non-payment, the payment is refunded automatically.
- **Webhook failures** are listed in the Razorpay Dashboard (Webhooks → the endpoint → logs).
  Razorpay retries automatically, and duplicates are ignored.
- **Turning deposits off** stops new deposits. Bookings already awaiting a deposit keep their deadline,
  and paid ones keep their refund rules.

## 5. Go-live gate (before any `rzp_live_` key)

Live keys are refused unless `RAZORPAY_ALLOW_LIVE=true`. Set it only when all of the following are true,
with evidence in a release report:

- [ ] Automated tests pass:
  - pgTAP `payments.test.sql`;
  - unit `payments.test.ts` (signature valid, tampered, wrong secret; duplicates; amount mismatch);
  - E2E `payments.spec.ts`.
- [ ] **A real Test Mode journey works** with the real Razorpay Checkout on the deployed site:
  1. the traveller pays by UPI or a test card;
  2. it shows as paid;
  3. the traveller cancels;
  4. the refund arrives as processed.
- [ ] No Content-Security-Policy errors in the browser console during Checkout. Razorpay publishes no
      official list of origins; the allowed ones are in `next.config.ts`.
- [ ] The daily cron ran, and `/admin/payments` shows the right balances.
- [ ] Razorpay KYC is complete and settlement goes to the right bank account.
- [ ] Terms and privacy are reviewed by a lawyer (deposits, refunds, Himverse collecting on partners'
      behalf), and the owner signs off.
