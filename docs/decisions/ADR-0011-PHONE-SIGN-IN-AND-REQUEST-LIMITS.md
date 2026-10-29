# ADR-0011: Phone sign-in with SMS codes, and request limits per visitor

- Status: Accepted (2026-10-29, owner)
- Related: [ADR-0002](ADR-0002-AUTHORIZATION-MODEL.md), [ADR-0007](ADR-0007-ONE-ACCOUNT-TYPE-PER-ACCOUNT.md),
  [ADR-0010](ADR-0010-CAPTCHA-TURNSTILE.md), [SECURITY](../security/SECURITY.md)

## Context

An auth audit (2026-10-29) found email/password, Google, two-step login, sessions and RLS in place.
Two gaps remained:

1. **No phone sign-in.** Many travellers in the region use a mobile number rather than email.
2. **No per-visitor limits on sign-in, sign-up and email sends.** Our server calls Supabase Auth, so
   Supabase sees the server's IP: every visitor shares one budget, and nobody is limited individually.
   The CAPTCHA (ADR-0010) helps but isn't on yet and doesn't stop a human-paced attack on one account.

SMS also costs money per message and is a target for SMS pumping (fraudsters triggering texts to
premium numbers).

## Decision

### Phone sign-in

- **Supabase Auth's own SMS OTP** (`signInWithOtp` with `channel: "sms"`, `verifyOtp`). Supabase
  generates, hashes, expires and checks codes; the app never sees or logs them. No custom OTP system.
- **Sign-in and sign-up are one flow:** a new number creates an account, so the answer never reveals
  whether a number is registered. On the sign-up page the chosen type (traveller or partner) is passed as
  metadata, which the database applies only when it creates the account; it can never be admin
  (ADR-0007). From the sign-in page a new number gets no type and chooses on `/welcome`, like Google.
- **Numbers:** a country list (India first) with mobile patterns, converted to E.164 on the server
  (`src/lib/phone.ts`). No phone library: the list is small, and the SMS provider validates delivery.
- **Linking:** a signed-in account adds or changes its number in settings with `updateUser({ phone })`.
  The number is attached only after the code sent to it is entered (`type: "phone_change"`), so the
  person proves control of both the account and the phone. Accounts with two-step login must pass it
  first. A number already on another account is refused; accounts are never merged.
- **Identity:** the Supabase user ID stays the only identity. Email/Google linking stays as Supabase
  manages it (verified emails only). Verified emails and phone numbers are identity attributes, never
  authorization: roles come only from `profiles.account_type` and `user_roles`.
- **Off by default:** `NEXT_PUBLIC_AUTH_PHONE_ENABLED=true` shows it, after an SMS provider is configured
  in Supabase. While off, the actions refuse (`FORBIDDEN`) before any SMS.

### Request limits

- **Counted in our Postgres** (migration `request_rate_limits`): a fixed window per bucket and key,
  updated with one atomic upsert, so concurrent requests can't slip past. No new service.
- **Keys are SHA-256 hashes** of the visitor IP, the normalised email or phone, or a platform key.
  No raw identifiers are stored; counters are pruned after two days.
- **Only the server can count:** `hit_rate_limit` is executable by `service_role` only, called from
  `src/server/auth/limiter-db.ts` (that one function, a 3-second timeout). If browsers could call it,
  anyone could exhaust someone else's per-email budget.
- **Trusted IP:** `x-forwarded-for` only on Vercel (`VERCEL=1`), which sets it itself. Elsewhere it is
  client-controlled, so IP limits are skipped.
- **Limits** (`src/server/auth/request-limits.ts`, provisional):

  | Bucket | Limit |
  | --- | --- |
  | Sign-in per IP / per email | 30 / 10 per 15 min |
  | Sign-up per IP | 10 per hour |
  | Recovery and confirmation emails per IP / per email | 10 / 5 per hour |
  | Google start per IP | 30 per 15 min (HTTP 429 + `Retry-After`) |
  | SMS per number | 1 per 60 s, 5 per hour |
  | SMS per IP | 10 per hour |
  | SMS platform-wide | `SMS_DAILY_LIMIT` per day (default 200; 0 stops SMS) |
  | Code checks per number / per IP | 5 / 30 per 15 min |

- **Every check counts** (all buckets, including refused requests), so switching identifiers doesn't
  skip a count. Server Actions return `RATE_LIMITED` with the wait in the message.
- **When the counter is unavailable:** sign-in, sign-up and email sends **fail open** (logged as
  `security.rate_limit_unavailable`): Supabase's limits and the CAPTCHA still apply, and locking everyone
  out is worse. SMS sends and code checks **fail closed**: they cost money or guard a secret.

## Alternatives considered

- **Upstash Redis (Vercel Marketplace):** faster counters, but a new account, vendor and secret for a
  low-traffic MVP. Postgres handles this load, and moving later is local to one module.
- **Process memory:** doesn't work across serverless instances.
- **CAPTCHA only:** stops bots, not a person guessing one account's password slowly, and does nothing
  for SMS cost.
- **Custom OTP table:** reinvents expiry, hashing and replay protection that Supabase Auth already has.
- **`libphonenumber-js`:** complete, but a large dependency for a list of about ten countries.

## Consequences

- `SUPABASE_SECRET_KEY` is now used by a second documented path (the limiter). Without it, sign-in still
  works (limits fail open, logged) and SMS is refused.
- A per-email sign-in limit lets someone delay a known person's sign-in for up to 15 minutes. Accepted:
  it is short and never permanent.
- Fixed windows allow up to twice a limit across a window boundary. Accepted at these sizes.
- Before turning phone sign-in on: an SMS provider in Supabase (Twilio, MessageBird, Vonage or
  Textlocal), and for Indian numbers a TRAI DLT registration (sender ID and template), which can take
  days or weeks. See [ENVIRONMENTS](../operations/ENVIRONMENTS.md#phone-sign-in-sms).
- Phone-only accounts have no email, so they can't use password reset. They sign in with a code.
