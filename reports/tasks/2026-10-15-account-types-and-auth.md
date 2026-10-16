# Task Report: One account type per account + modern sign-in (Phases 1 and 2)

- Date: 2026-10-15
- Author: Claude Code (agent)
- Branch / commit: main / uncommitted (base 199e79b)

## Objective and scope

The owner said the role mix was "messed up". They asked for different interfaces and access for admins,
partners and travellers, so that admins can't book or apply as a partner. They also asked for modern
sign-in: password reset and change, email confirmation with resend, two-step login for admins and
partners, redesigned pages, and Google sign-up and sign-in.

Decisions:

- One role per account.
- Real partner listing types (Phase 3, not in this task).
- Phase order: roles, then auth, then partner types.

Out of scope: Phase 3 (partner listing types), production deployment (owner-operated).

## Summary of implementation

**Phase 1: account types** (ADR-0007, migration `20261014215750_account_types`)

- `profiles.account_type` is traveller, partner or admin. Email sign-up stores the user's choice;
  Google sign-up chooses once on `/welcome`; admin comes only from the owner-run role grant.
- Database triggers stop non-travellers from booking or planning trips, and non-partners from joining
  providers. Provider authority requires a partner account.
- A security review found one blocker: an admin who kept an old membership could self-verify and clear
  moderation. Fixed with raw-membership conflict checks, admin grants refused for members, revoked
  admins become untyped again, and `submit_provider_application` restricted to partners.
- App: separate areas, each with its own guards and menus, and account settings in each area:
  - partner booking detail at `/provider/bookings/[id]`;
  - account settings at `/account`, `/provider/account` and `/admin/account`.
- Every action checks the account type. Experience pages tell partners and admins that booking is for
  traveller accounts.

**Phase 2: sign-in and security** (migration `20261014221826_two_step_login`)

- **Two-step login:** TOTP setup at `/mfa/setup` (QR code plus a key for manual entry) and the
  second step at `/mfa/verify`. Required for partners and admins. The database makes `has_role` and
  `is_provider_member` require `aal2`, and provider writes require `aal2`.
- **Password reset:** `/forgot-password` sends a PKCE email (the same answer whether or not the
  address exists), which leads to `/auth/reset` and then `/reset-password`. That page requires a
  recovery sign-in from the last 15 minutes, plus the second step if one is enrolled, and signs out
  other sessions.
- **Change password** in account settings checks the current password on a separate cookie-less
  client, so the session's two-step level is untouched. Google-only accounts are told they have no
  password.
- **Email confirmation:** "check your email" after sign-up, with resend and a 60-second cooldown.
  Signing in with an unconfirmed email offers resend.
- **Pages:** show/hide password, a strength meter with no new dependency, a "Forgot password?" link,
  and a Google button with the logo.

## Files

| Change | Path |
| --- | --- |
| Created | `supabase/migrations/20261014215750_account_types.sql`, `20261014221826_two_step_login.sql` |
| Created | `supabase/tests/accounts.test.sql` (28 tests), `two_step.test.sql` (10 tests) |
| Created | `src/server/auth/{assurance,mfa,passwords}.ts`, `src/lib/password-strength.ts`, `src/components/password-field.tsx` |
| Created | `src/features/auth/components/{account-type-form,password-forms,mfa-forms}.tsx`, `src/features/account/components/account-settings.tsx`, `src/features/bookings/components/booking-detail.tsx` |
| Created | `src/app/(auth)/{welcome,forgot-password,reset-password,mfa/setup,mfa/verify}/page.tsx`, `src/app/auth/reset/route.ts`, `src/app/provider/{account,bookings/[id]}/page.tsx`, `src/app/admin/account/page.tsx` |
| Created | `tests/e2e/account-security.spec.ts`, `tests/unit/{password-strength,landing}.test.ts` (landing rewritten) |
| Modified | Session guards, auth actions and schemas, site header, portal shell, booking, provider and itinerary actions, sign-in and sign-up pages, `supabase/config.toml` (local TOTP, E2E redirect URL), existing pgTAP / unit / E2E tests, docs (ADR-0002 status, ADR-0007 notes, AUTHORIZATION_AND_RLS, ENVIRONMENTS) |
| Deleted | `docs/decisions/ADR-0007-ONE-ACCOUNT-TYPE.md` (a duplicate of the ADR written in another session) |

## Security and migration implications

- Both migrations are backward compatible with the currently deployed code:
  - old sign-ups leave the type empty, and the type is claimed on the first booking or application;
  - **but** partners and admins on old code will lose their powers until they can pass two-step
    login. The two-step migration must ship together with this code.
- Existing accounts:
  - Admins become admin and members become partner.
  - Accounts with bookings or trip plans become traveller; the rest stay untyped and choose on
    `/welcome`.
  - An admin or partner who previously booked as a traveller can no longer see those bookings in the
    app. The owner should check this before deploying:
    `select b.reference, p.account_type from bookings b join profiles p on p.id = b.traveler_id where p.account_type <> 'traveller' and b.status in ('requested','confirmed');`
- Rollback: redeploy the old code. The schema changes don't break it, except that partner and admin
  powers need `aal2` (two-step login). To fully roll back, revert `has_role` and `is_provider_member`
  with a forward migration.

## Tests and commands executed

| Command | Result (actual) |
| --- | --- |
| `npm run db:test` | Pass. 14 files, 388 tests |
| `npx vitest run tests/unit` | Pass. 326 tests |
| `npm run test:e2e` (production build, local Supabase with TOTP and Mailpit) | Pass. 62 tests, including real-email password reset, change password, partner two-step, admin two-step, and per-type redirects |
| Security reviews (security-reviewer agent) | Phase 1: 1 blocker, 3 should-fix, 6 nits; all addressed except N3 (sign-up type squatting, accepted) and N4 (`next` lost when signed out, UX only). Phase 2: see the addendum |

## Known issues, limitations, unverified assumptions

- **Google sign-in and `/welcome`** are covered by pgTAP and unit tests only. E2E can't run Google.
- **Recovery codes** for two-step login are not offered, because Supabase's support is experimental.
  A lost phone is reset by the owner (runbook in ENVIRONMENTS).
- **Production needs the dashboard settings** in ENVIRONMENTS: SMTP, email confirmations, TOTP
  enabled, and redirect URLs `/auth/reset`, `/auth/callback` and `/auth/confirm`.
- **Another Claude session (`himverse-1a`)** edited CLAUDE.md and the product docs in parallel. Those
  changes are not reviewed here.

## Environment variables or manual steps required

No new env vars. The owner needs to:

1. Run `supabase db push`. Three migrations are pending in production: bookable, account_types and
   two_step_login.
2. Apply the Supabase dashboard auth settings.
3. Deploy the code.
4. Have each admin set up two-step login at their next sign-in.

## Follow-up tasks

- Phase 3: partner listing types (accommodation, transport, guides).
- A read-only "past trips" view for converted accounts, if the check query finds any.

## Addendum: Phase 2 security review

No blockers. The four should-fix items:

- **S2, fixed:** per-account limits (migration `20261014235308_auth_attempt_limits`). Two-step codes
  and current-password checks are limited to 5 failures per 15 minutes, keyed only by `auth.uid()`.
  Failures are logged without the guessed value.
- **S3, fixed:** Supabase's per-address email limit is no longer shown, so it can't reveal which
  accounts exist.
- **S4, fixed:** changing a password requires the second step if one is enrolled.
- **S1, accepted and documented:** first-time enrolment needs only the password. The mitigation is
  operational (SECURITY "Known accepted risks"). Requiring an email code before enrolment is the
  owner's call.

Nits:

- **Fixed:** N1 (more tests), N2 (comment), N3 (sign-out failures logged), N4 (failure logging),
  N6 and N9 (runbook and SECURITY docs).
- **Not fixed:** N5 (own membership rows readable at aal1; negligible), N7 (Google-only account that
  later sets a password; UX only), N8 (only the first factor is tried).
- **Tests after the fixes:** 395 pgTAP tests pass.
