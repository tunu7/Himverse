# Task Report: Auth audit, phone sign-in (off) and per-visitor request limits

- Date: 2026-10-29
- Author: Claude (agent), with owner decisions from Tunu Doley
- Branch / commit: main / uncommitted

## Objective and scope

Owner request: audit the app's authentication and authorization against a production checklist and build
the smallest complete secure system. Audit result: email/password with confirmation, Google (PKCE),
password reset and change, TOTP for partners and admins, server-verified sessions, RLS with per-role
pgTAP tests, partner isolation, enumeration-safe responses, per-account attempt limits and account
deletion already existed. Two real gaps were found and, with the owner's choices, built:

1. Phone-number sign-in with SMS codes: **built, switched off** until an SMS provider and TRAI DLT
   registration are in place.
2. Per-visitor (IP) and per-identifier request limits for sign-in, sign-up, emails, Google start and
   SMS: **counted in Postgres** (no new service).

Out of scope: organizations (the partner/provider membership model already isolates tenants), a new
permission engine, Sentry and email (waiting on owner actions), enabling SMS in production.

## Summary of implementation

`private.request_rate_limits` with `public.hit_rate_limit` (service_role only) counts requests per
bucket and SHA-256-hashed key in fixed windows via one atomic upsert; an hourly cron prunes old windows.
`src/server/auth/limiter-db.ts` is the only caller (secret key, that one RPC, 3 s timeout).
`src/server/auth/request-limits.ts` holds the limits, the trusted client IP (Vercel's `x-forwarded-for`
only when `VERCEL=1`) and the fail-open/fail-closed rules. Sign-in, sign-up, forgot-password and resend
actions, and `/auth/google` (429 + `Retry-After`) now enforce them.

Phone sign-in uses Supabase Auth OTP (`signInWithOtp` / `verifyOtp`), never storing or logging codes.
Sign-in and sign-up are one flow (no enumeration); the sign-up page passes the chosen account type for new
accounts only. Account settings can add or change a number: attached only after the code to that number,
after two-step login when enrolled, never if another account has it. `src/lib/phone.ts` validates mobile
numbers for 11 countries and converts to E.164 on the server. Sends are limited per number (60 s
cooldown, 5/hour), per IP, and by a daily platform budget (`SMS_DAILY_LIMIT`); code checks per number and
IP. SMS paths fail closed.

## Files

| Change   | Path | Notes |
| -------- | ---- | ----- |
| Created  | `supabase/migrations/20261029200243_request_rate_limits.sql` | Counter table, `hit_rate_limit`, prune job |
| Created  | `src/server/auth/{limiter-db,request-limits,phone}.ts` | Limiter client, limit rules, phone sign-in |
| Created  | `src/lib/phone.ts`, `src/features/auth/components/phone-forms.tsx` | Number rules; phone sign-in and linking UI |
| Created  | `supabase/tests/request_rate_limits.test.sql`, `tests/integration/request-rate-limits.test.ts` | DB and parallel tests |
| Created  | `tests/unit/{phone,phone-auth,request-limits}.test.ts`, `tests/e2e/phone-sign-in.spec.ts` | Unit and E2E tests |
| Created  | `docs/decisions/ADR-0011-PHONE-SIGN-IN-AND-REQUEST-LIMITS.md`, this report | |
| Modified | `src/features/auth/{actions,schemas}.ts`, `src/app/auth/google/route.ts`, `src/app/(auth)/{sign-in,sign-up}/page.tsx`, `src/features/account/components/account-settings.tsx` | Limits, phone actions and UI |
| Modified | `src/lib/env.ts`, `src/lib/env.server.ts`, `.env.example`, `scripts/write-local-env.mjs`, `supabase/config.toml` | New env vars; local test SMS codes |
| Modified | `src/types/database.ts` | Regenerated |
| Modified | `supabase/tests/privileges.test.sql`, `tests/unit/{env,oauth-routes}.test.ts` | Reviewed function list; new cases |
| Modified | SECURITY, ENVIRONMENTS, INCIDENT_RESPONSE, RELEASE_CHECKLIST, MVP_SCOPE, DATABASE_DESIGN, API_CONTRACTS, ADR index, CLAUDE.md | Docs |
| Deleted  | None | |

## Architectural and database changes

One private table and two functions; see ADR-0011. No RLS policy changes on existing tables.

## Security and migration implications

- Secret-key use: a second documented system path (`limiter-db.ts`), justified because the counter
  must not be callable by browsers (they could exhaust another person's per-email budget).
- Expand-only migration; deployed code is unaffected until the new code ships. Rollback: drop the
  function, table and cron job in a forward migration; the app then fails open on sign-in and closed on
  SMS (phone sign-in is off anyway).
- Fail-open on sign-in/sign-up/emails is deliberate (availability); Supabase Auth limits remain.

## Tests and commands executed

| Command | Result (actual) |
| ------- | --------------- |
| `npx supabase migration up` / `db reset` | Applied cleanly |
| `npm run db:test` | Pass: 24 files, 608 tests (incl. 14 new limiter tests) |
| `npm run test:integration` | Pass: 5/5 (20 parallel hits vs limit 5 → exactly 5 allowed) |
| `npm run verify` | format, lint (0 errors, 2 existing warnings), typecheck, 442 unit tests, build: pass (build needed one retry for Next's security advisory) |
| `npm run test:e2e` (built with `NEXT_PUBLIC_AUTH_PHONE_ENABLED=true`) | 76 passed, 4 failed: 3 phone success paths and payments; all from `SUPABASE_SECRET_KEY` missing in the local `.env.local` (logs: `EnvValidationError`). The invalid-number phone test passed; sign-in limits failed open as designed (22 logged events) |
| Relative doc links in changed docs | All resolve |

## Build, lint and type-check status

- Format: pass · Lint: pass (2 existing warnings) · Typecheck: pass · Unit: pass (442) · Build: pass
- E2E: 76 pass, 4 fail (local env key) · DB tests: pass (608) · Integration: pass (5)

## Known issues, limitations, unverified assumptions

- **Not verified locally:** phone sign-up/sign-in, cooldown and linking success paths, and the app-to-
  limiter call with a real key. CI writes `.env.local` with the key (`npm run env:local`), so they should
  run there. Supabase's local test OTPs (`[auth.sms.test_otp]`) are assumed to work without an SMS provider.
- Vercel's `x-forwarded-for` is trusted as set by the platform (documented Vercel behaviour), not tested
  on a deployment.
- Supabase Auth still sees our server's IP for its own per-IP limits (pre-existing; our limits and the
  CAPTCHA mitigate).
- Phone-only accounts have no email, so no password reset (they sign in with a code).

## Environment variables or manual steps required

- New: `NEXT_PUBLIC_AUTH_PHONE_ENABLED` (default `false`), `SMS_DAILY_LIMIT` (default 200).
- Production must have `SUPABASE_SECRET_KEY` (already used by payments).
- Owner: `npx supabase db push` for `20261029200243_request_rate_limits`, then deploy.
- Phone sign-in later: DLT registration, SMS provider in Supabase, then the flag
  ([ENVIRONMENTS](../../docs/operations/ENVIRONMENTS.md#phone-sign-in-sms)).
- Locally: `npm run env:local -- --force` rewrites `.env.local` with the key and the phone flag.

## Follow-up tasks

- Turn on CAPTCHA, Sentry and email (release checklist).
- Run the phone E2E in CI and on production with a real number once SMS is configured.
- Consider moving counters to a managed store only if auth traffic grows well beyond MVP levels.
