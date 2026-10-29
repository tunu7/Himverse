# Security, authorization and RLS

Decisions: [ADR-0002](../decisions/ADR-0002-AUTHORIZATION-MODEL.md) (authority in the database),
[ADR-0007](../decisions/ADR-0007-ONE-ACCOUNT-TYPE-PER-ACCOUNT.md) (one account type),
[ADR-0009](../decisions/ADR-0009-ACCOUNT-DELETION-AND-ALERTS.md) (account deletion),
[ADR-0011](../decisions/ADR-0011-PHONE-SIGN-IN-AND-REQUEST-LIMITS.md) (phone sign-in, request limits). Behaviour is pinned
by `supabase/tests/*.test.sql`. Report vulnerabilities privately to the maintainers (contact to be
published before launch); never in public issues.

## Threat model (MVP)

| Asset | Threat | Control |
| --- | --- | --- |
| Traveller data | Cross-user access | RLS per user; explicit columns; pgTAP |
| Partner data and bookings | Reading/changing other partners' bookings | RLS via `provider_members` + server checks |
| Catalogue | Unverified listings; AI fabrication | Admin verification; AI never writes curated tables |
| Bookings | Double booking; false confirmation | Idempotency keys; DB-enforced transitions |
| Payments | Marking paid without money; double refunds | Signed webhooks/server fetch only; claimed, idempotent refunds ([PAYMENTS](../operations/PAYMENTS.md)) |
| Secrets | Leak to browser or logs | `server-only` modules; no `NEXT_PUBLIC_` secrets; log redaction |
| AI pipeline | Prompt injection | Output validation + grounding; no write tools ([AI_ARCHITECTURE](../ai/AI_ARCHITECTURE.md)) |
| Google sign-in | Login CSRF, open redirect | PKCE cookie; `next` limited to internal paths |
| Accounts | Credential stuffing, enumeration, lost authenticator | Supabase Auth limits; per-IP and per-email request limits (ADR-0011); generic errors; per-account attempt limits; Turnstile CAPTCHA verified by Supabase ([ADR-0010](../decisions/ADR-0010-CAPTCHA-TURNSTILE.md); on before launch) |
| Phone sign-in | SMS pumping and cost; code guessing; taking over a number | Supabase OTP (hashed, expiring); per-number, per-IP and daily SMS limits that fail closed; per-number code-check limits; a number is attached only with the code sent to it; off until configured (ADR-0011) |
| Resources | Spam; AI cost runaway | DB rate limits; per-user + platform AI caps; kill switch |

## Roles and authority

**Every account has exactly one type** (`profiles.account_type`: traveller, partner or admin), never
writable through the API. Only travellers book and plan trips; only partners run providers; admins
moderate (`accounts.test.sql`). **Partner and admin powers need two-step login:** `has_role` and
`is_provider_member` are true only in `aal2` sessions (`two_step.test.sql`). Roles are never read from
`user_metadata` or anything client-supplied; policies look them up live.

| Actor | Authority from | Can |
| --- | --- | --- |
| anonymous | — | Read verified providers, published destinations, and listings that are published, from a verified provider, at a published destination |
| traveller | `account_type = 'traveller'` | Above, plus own profile (update `display_name` only), own itineraries, own bookings and payments |
| partner (provider member) | partner account + `provider_members` row + provider `status` | Edit the public profile (not while `pending_review`/`suspended`) and private details (only `draft`/`rejected`); manage listings (≤ 200), publish only while `verified` and not admin-locked; add dates up to 2 years ahead; read and answer their bookings; read their deposits and balance |
| admin | `user_roles` row `admin` | Read all; review providers (`review_provider`); manage destinations; unpublish/archive listings (moderation lock); switch deposits; record payouts |
| itinerary owner | `itineraries.owner_id` | Read, rename, switch version, delete own itineraries. Versions/items are immutable, written only by `save_itinerary_version` ([ADR-0003](../decisions/ADR-0003-AI-ITINERARY-GENERATION.md)) |
| booking parties | `traveler_id` or provider membership | Read the booking and its history (not who acted). All writes go through the booking functions ([ADR-0004](../decisions/ADR-0004-BOOKING-LIFECYCLE.md)) |

**Admin console** (`/admin`, `requireAdminForPage`: signed out → sign-in, non-admin → plain 404). Pages:
overview, providers, destinations, experiences (moderation), bookings (read-only, no traveller contact
details), payments (deposit switch, partner balances, payouts), users. Every read and write goes
through `src/server/admin/*` with the signed-in user's client, so RLS stays the authority.

### Admin bootstrap runbook

There is **no application path that grants admin**. Admins are created only by the database owner
running SQL, never with the secret key. Prerequisite: email confirmations **on** in that environment.

1. The future admin signs up as a traveller, confirms their email, signs in, and sends their
   **Account ID** (on `/account`) to the owner over a trusted channel.
2. The owner opens the project's SQL Editor (or `psql` locally); never `npx supabase status` in an agent
   session (it prints keys).
3. Check the account: `select id, email, email_confirmed_at, last_sign_in_at from auth.users where id = '<account id>';`
   Stop if the email doesn't match, it isn't confirmed, or the last sign-in is missing or old.
4. Grant by user id (creates the first admin only once):

   ```sql
   insert into public.user_roles (user_id, role, granted_by)
   select u.id, 'admin', null from auth.users u
   where u.id = '<account id>' and u.email_confirmed_at is not null
     and not exists (select 1 from public.user_roles where role = 'admin')
   returning user_id, role, granted_at;
   ```

5. Expect exactly one row. The admin signs out and in, opens `/admin`, and sets up two-step login.
   Record who granted it, when, and to whom, in the operations log (not the repo).

Later admins and revocation use the same SQL path without the `not exists` guard, with `granted_by` set.
Never put these statements in application code, migrations or seeds.

## RLS rules

1. Enable RLS in the same migration that creates the table. No exceptions.
2. One policy per operation and role (`to authenticated` / `to anon`); no `for all` on sensitive tables.
3. `update` policies have `using` **and** `with check`.
4. Use `(select auth.uid())` and index policy columns.
5. `security definer` helpers: `set search_path = ''`, fully qualified names, `private` schema, execute
   revoked from API roles unless needed.
6. Never trust `user_metadata`. Views use `security_invoker = true`.
7. Only partners (or verified payment state) can confirm a booking; travellers never set status.
8. `supabase/tests/privileges.test.sql` snapshots every table, function and column privilege of API
   roles: a new object must be added there deliberately.

Every table has pgTAP tests impersonating each role, asserting allowed **and** denied operations
(`npm run db:test`).

## Requirements

1. **Secrets** only in Vercel/Supabase env and `.env.local` (gitignored), read through
   `src/lib/env.server.ts`. `.claude/settings.json` denies agents reading env files, `supabase status`,
   `db push`, `link` and `git diff --no-index`.
2. **Least privilege:** the user-context client by default. The **secret key** is used only by the
   payments system path (`src/server/payments/system-db.ts`, payment RPCs only) for webhooks, the
   payments cron and server-verified checkout, and by the request limiter
   (`src/server/auth/limiter-db.ts`, `hit_rate_limit` only).
3. **Authorisation in depth:** RLS **and** checks in every Server Action and Route Handler (they are
   public endpoints). `src/proxy.ts` only redirects optimistically.
4. **Validate input** at every boundary ([API_CONTRACTS](../api/API_CONTRACTS.md)).
5. **Output safety:** React escaping; no `dangerouslySetInnerHTML` without sanitising and review; AI
   text rendered as text.
6. **Webhooks:** verify the signature on the raw body first; process idempotently.
7. **Headers** (`next.config.ts`, tested by `security-headers.spec.ts`):
   - a CSP with `default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'` and
     `form-action 'self'`;
   - HSTS, `nosniff`, `X-Frame-Options: DENY`, a referrer policy, a permissions policy and COOP;
     `X-Powered-By` is removed;
   - `script-src` allows `'unsafe-inline'`, because nonces would make every page dynamic (Cache
     Components);
   - **Exception:** `/bookings/:id` also allows Razorpay Checkout (script, frame, API, popups and
     `payment=(self)`);
   - no `upgrade-insecure-requests` (it broke prefetches on plain-HTTP builds).
8. **Dependencies:** lockfile committed; `npm audit --omit=dev` reviewed. 5 high advisories in the
   dev-only `eslint-config-next` chain (`braces`) are accepted. The fix would downgrade to Next 14.
9. **Never weaken a control to get green** (RLS, policies, tests).

## Accounts and sign-in

- **Two-step login (TOTP):** required for partners and admins.
- **Password reset:** a PKCE email link (`/auth/reset`). `/reset-password` needs a recovery sign-in
  from the last 15 minutes, plus the second step if enrolled. Other sessions are signed out.
- **Password change:** checks the current password on a separate cookie-less client. It requires the
  second step if enrolled and signs out other sessions.
- **Wrong two-step codes or current passwords:** limited to 5 per account per 15 minutes
  (`auth_attempt_limits`). The guessed values are never logged.
- **No account enumeration:** forgot-password and resend always answer the same; sign-in has one
  message for a wrong email or password; phone sign-in and sign-up are one flow, so it never says
  whether a number is registered.
- **Phone sign-in** (ADR-0011, off until an SMS provider is set up): Supabase Auth's SMS OTP; we never
  see or log codes. A number is added to an existing account only with the code sent to it, after the
  second step if enrolled, and never if another account has it. Phone details are identity, never
  authorization.
- **Account deletion** (ADR-0009):
  - needs a sign-in within 15 minutes, which the **database** checks from the JWT `amr`;
  - bookings are anonymised by a trigger on every deletion path.
- **Lost authenticator (runbook):** verify the person out-of-band. Then, in Supabase Auth, delete
  their TOTP factor **and** sign them out everywhere; existing `aal2` tokens last up to an hour.

## Rate limits

Enforced in the database (triggers or `security definer` functions keyed on the acting user, so every
path is covered). They raise `54000`, which the app shows as `RATE_LIMITED`. The values are provisional.

| Action | Limit | Where |
| --- | --- | --- |
| Booking requests | 30/hour, 60/day, 40 awaiting a reply per traveller | `private.enforce_booking_request_limits` |
| Provider applications | 3/day, 5 unverified per user | `private.enforce_provider_application_limits` |
| Listings | 200 per provider | `private.enforce_experience_limits` |
| Dates | 366 open future dates per listing; verified providers; ≤ 2 years ahead | trigger + policy |
| Itinerary generations | 10/hour, 30/day per user (reserved before the model call) | `begin_itinerary_generation` |
| Platform AI | `AI_DAILY_GENERATION_LIMIT` per IST day (default 300) | `begin_itinerary_generation` |
| Confirmed booking total | INR 1 crore | check constraint |

**Sign-in, sign-up, emails and SMS** are limited per visitor IP and per email or phone number by
`hit_rate_limit` (ADR-0011 has the table). Only the server's privileged path can count, so nobody can
exhaust another person's budget from a browser. Keys are hashed. Sign-in, sign-up and email limits fail
open if the counter is down (logged); SMS and code checks fail closed. Supabase Auth's own limits and the
CAPTCHA still apply on top.

## Personal data

- **Collected:** the minimum, namely name, email, trip preferences, and the booking contact phone.
- **Deletion:** self-serve (ADR-0009).
- **Open:** retention for active accounts. India's DPDP Act 2023 review is pending before launch.

## Accepted risks

- **First-time two-step setup needs only the password**, so an attacker who already knows it could
  enrol first. Mitigation: admins enrol in a controlled bootstrap, and partners are told to enrol
  promptly. Follow-up: an email code before enrolment.
- **Per-email sign-in limit:** someone who knows an address can delay that person's password sign-in
  for up to 15 minutes. Short and never permanent; Google and phone sign-in are unaffected.
- **IP limits only on Vercel:** elsewhere the forwarding header can't be trusted, so local and
  self-hosted runs have per-email and per-number limits only.
