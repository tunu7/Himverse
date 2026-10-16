# Task Report: Phase 1 — identity, authorization and tourism data foundation

- Date: 2026-10-12
- Author: Claude Code (Opus 5.5), plan approved with three adjustments
- Branch / commit: `main`, **uncommitted** on top of `f2da8ce` (no commit, push or deploy, as instructed)

## Objective and scope

Design and implement the Phase 1 identity and authorization model, provider applications and
verification, destinations, experiences, and the public `/explore` route.

User adjustments to the approved plan:

1. A protected one-time admin bootstrap, with no app path that grants admin.
2. Publication is conditional on provider verification and destination publication; suspended
   providers can't publish or expose anything; MVP behaviour for edits to live content is documented.
3. Minimal scope. The admin review workflow is only as large as needed to verify lifecycle security.

Out of scope (not built): bookings, payments, AI, media uploads, availability, staff invitations,
admin-grant UI, destination-editing UI, experience field editing (create and status changes only).

## Summary of implementation

- **Authorization model:** [ADR-0002](../../docs/decisions/ADR-0002-AUTHORIZATION-MODEL.md).
  - Admin is a row in `user_roles`, which has no write grants for API roles.
  - Provider authority comes from `provider_members` combined with the provider's `status`.
  - Every check is a live RLS lookup, so changes apply on the next request.
  - No secret-key client exists or is used.
- **Lifecycle:** status changes happen only through three `security definer` RPCs, and each change writes an
  audit row in `provider_status_events`. `status` and `verified_at` are excluded from every update grant,
  admins included.
- **Visibility:** an experience is public only when it is `published`, its provider is `verified`, and its
  destination is published. These are evaluated live in RLS.
- **App:**
  - Email/password auth through Server Actions, plus `/auth/confirm`.
  - `src/proxy.ts` refreshes the session and does optimistic redirects only.
  - `src/server/auth/session.ts` uses `getClaims()` and a live role lookup that fails closed.
  - Pages: `/account`, `/provider`, `/admin/providers` (a 404 for non-admins), and `/explore`, which uses an
    anonymous, cookie-less client so only RLS-public rows ever show.
- **Docker:** installed by the user during this task. Docker Desktop was installed but not running, so I
  started it with `open -a Docker`. Local Supabase was verified before any database work (see commands).

## Files

| Change | Path | Notes |
| --- | --- | --- |
| Created | `supabase/migrations/20261012131029_identity_and_roles.sql` | `private` schema, `profiles`, `user_roles`, signup trigger, `has_role` |
| Created | `supabase/migrations/20261012131030_providers.sql` | Providers, members, private details, status events, lifecycle RPCs |
| Created | `supabase/migrations/20261012131031_catalog.sql` | Destinations, experiences, publication rules |
| Created | `supabase/seed.sql` | Local-only sample catalogue: 2 visible, 2 deliberately hidden experiences; no users or admins |
| Created | `supabase/tests/{identity_and_roles,providers,catalog}.test.sql` | 87 pgTAP assertions |
| Created | `src/proxy.ts`, `src/server/{auth/session,profiles/profiles,providers/providers,providers/status,catalog/catalog}.ts` |  |
| Created | `src/lib/{validation,redirect,format}.ts`, `src/lib/supabase/{public,errors}.ts` |  |
| Created | `src/features/{auth,account,providers,admin}/{schemas,actions}.ts` + `components/*` |  |
| Created | `src/app/{sign-in,sign-up,account,explore,provider,admin/providers}/page.tsx`, `src/app/auth/confirm/route.ts`, `src/app/error.tsx` |  |
| Created | `src/components/{site-header,page-shell,form-feedback}.tsx` |  |
| Created | `src/types/database.ts` | Generated (`npm run db:types`), excluded from Prettier |
| Created | `scripts/write-local-env.mjs` | Writes `.env.local` from `supabase status` (public values only, never printed) |
| Created | `tests/unit/{session,provider-status,schemas,redirect,database-errors,format}.test.ts`, `tests/e2e/{explore,auth-and-provider}.spec.ts` |  |
| Created | `docs/decisions/ADR-0002-AUTHORIZATION-MODEL.md`, this report |  |
| Modified | `src/lib/supabase/{server,client}.ts` | `Database` generics; server client awaits `cookies()` then `io()` before reading env (see issues found) |
| Modified | `src/lib/errors.ts` | `toLoggedFailure` |
| Modified | `src/app/layout.tsx` | Site header |
| Modified | `package.json` | Scripts `db:types`, `env:local` |
| Modified | `supabase/config.toml` | Local `minimum_password_length = 8` |
| Modified | `.github/workflows/ci.yml` | Job `database-build-e2e`: build without env, local Supabase, pgTAP, types drift check, E2E |
| Modified | `.claude/settings.json`, `.prettierignore` | Allow `db:types`; ignore generated types |
| Modified | `CLAUDE.md`, `README.md`, `docs/{decisions/README,security/AUTHORIZATION_AND_RLS,database/*,architecture/{SYSTEM_DESIGN,PROJECT_STRUCTURE},engineering/TESTING_STRATEGY,operations/ENVIRONMENTS,product/{MVP_SCOPE,ROADMAP}}.md` | Brought in line with the implementation |
| Created (gitignored) | `.env.local` | Local stack only; contents not displayed |

## Architectural and database changes

### Migrations

`20261012131029_identity_and_roles`, `20261012131030_providers`, `20261012131031_catalog`.

### Policy behaviour

| Table | anon | authenticated (non-member) | provider member | admin |
| --- | --- | --- | --- | --- |
| `profiles` | ✗ (no grant) | own row; update `display_name` only | same | read all |
| `user_roles` | ✗ | own rows, read only | same | read all; **no writes for anyone via the API** |
| `providers` | `verified` only | `verified` only | + own (any status); update `display_name`, `description`, `district` | read all; status only via `review_provider` |
| `provider_private_details` | ✗ | ✗ | own; update contact fields | read all |
| `provider_members` | ✗ | own memberships | own memberships | read all; no writes (created by RPC) |
| `provider_status_events` | ✗ | ✗ | own provider's | read all; written only by RPCs |
| `destinations` | `is_published` only | `is_published` only | same | full CRUD |
| `experiences` | published + verified + destination published | same | + own provider's (any status); insert/update but `published` only if verified and destination published; can't change `provider_id`; no delete | read all; update, with the same publish rule |

### RPCs

| Function | Caller | Checks |
| --- | --- | --- |
| `create_provider_application` | authenticated | Creates a draft provider, owner membership, private details and an audit row atomically |
| `submit_provider_application` | owner | `draft` or `rejected` → `pending_review`; non-owners get `P0002` (no existence leak) |
| `review_provider` | admin | Valid transitions only; note required to reject or suspend; an admin can't review a provider they belong to |

## Security and migration implications

- **Self-escalation:**
  - No API grant on `user_roles` writes. Tested for a traveler, and for an admin granting to someone else.
  - Signup metadata containing `"role":"admin"` grants nothing (tested).
  - Direct `status` and `verified_at` updates fail with `42501`, for admins too (tested).
- **Admin bootstrap:**
  - Runbook in `docs/security/AUTHORIZATION_AND_RLS.md`, run as the database owner, with a guard that only
    allows it when no admin exists.
  - Verified locally by executing the runbook SQL verbatim: first run inserted 1 row, second run inserted 0.
- **Suspension:** hides the provider and its experiences immediately, blocks publishing, and blocks editing
  published rows. Reinstating restores visibility (tested in pgTAP and in the UI).
- **Private data:** legal name and contact details live in a separate table, unreadable by anon, other users
  and other providers (tested).
- **Migrations:** these are new tables only. No data migration or rollback concerns yet. They have **not**
  been applied to any remote Supabase project.

## Tests and commands executed

| Command | Result (actual) |
| --- | --- |
| `which docker` (first attempt) | Not found. **Stopped and reported** as instructed |
| `docker info` (after user install) | Daemon not running → `open -a Docker` → ready: Docker Desktop 29.8.2, 8 CPU, ~4 GB |
| `npx supabase start` | All core services healthy; Postgres 17.11, pgTAP 1.3.3 |
| pgTAP smoke test (scratchpad) | PASS (1/1): runner confirmed before writing real tests |
| `npx supabase db reset` (local only, several times) | Success: migrations and seed applied |
| `npm run db:test` (final, after a fresh reset) | **PASS: 3 files, 87 tests** |
| Mutation check: added a self-grant policy, an all-public experiences policy, and an `update(status)` grant to the local DB | **FAIL as expected**: 8 assertions failed across all 3 files; then `db reset` restored a clean state |
| `npm run db:types` twice + `cmp` | Byte-identical (supports the CI drift check) |
| `npm run verify` (final) | **Pass**, exit 0: format, lint, typecheck, 67 unit tests, build |
| `npm run build` with `.env.local` moved aside | First attempt **failed** (`EnvValidationError` prerendering `/_not-found`); fixed; re-run **pass** |
| `npm run test:e2e` (final) | **Pass: 5/5**; no prerender warnings in the server log |
| One-off admin lifecycle E2E (scratchpad, not committed) | **Pass**: runbook 1 row then 0; admin 404 before bootstrap; verify → publish → on `/explore` → suspend needs note → hidden → provider sees note, can't republish; audit trail correct |
| Link/anchor audit | 0 broken links or anchors |
| Secret scan | No key-like strings; `.env.local` is gitignored |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `npm audit` | 5 high, the known dev-only ESLint chain (unchanged) |
| CI on GitHub | **Not run**: no remote |

## Build, lint and type-check status

- Format: pass
- Lint: pass
- Typecheck: pass
- Unit tests: pass (67 in 8 files)
- Build: pass, both with and without environment variables
- E2E: pass (9/9 after security hardening; 5/5 before), plus the one-off admin flow (1/1)
- DB tests: pass (158/158 in 5 files after security hardening; 87/87 before)

## Issues found and fixed during implementation

1. **Build needed env vars.** `createSupabaseServerClient()` validated env before `await cookies()`, so
   prerendering failed without Supabase env. Fixed by reading cookies first.
2. **Prerender errors at runtime.** supabase-js calls `Date.now()` during session load, which Cache Components
   flags during runtime prerendering. Fixed with `await io()` (Next 16.4 API) before creating the client.
3. **Seed data broke pgTAP tests.** DB tests now truncate seeded rows inside their rolled-back transaction.
4. **Strict schemas would reject framework fields.** React adds hidden `$ACTION_*` fields to `FormData`;
   `parseInput` drops only those keys.
5. Test-only fixes: the Next route announcer also has `role="alert"`, and Playwright's `name: "Publish"`
   also matched "Unpublish".

## Known issues, limitations, unverified assumptions

- **Edits to live content:** a verified provider's edits to live experiences and to its public profile go
  live without re-review. Accepted and documented in ADR-0002. Providers can't undo admin moderation
  (M1), and legal and contact details are frozen after submission (M2).
- **No rate limiting** on provider applications (review L4: slug squatting, queue flooding), and auth rate
  limits probably see Vercel's IPs rather than the user's because sign-in runs in Server Actions (review
  S2). Deferred: needs a CAPTCHA or rate-limit decision.
- **Slug enumeration:** unique slugs reveal whether a slug is taken, including on draft providers. Low risk.
- **`/explore` caps at 100 rows,** with no pagination or caching yet.
- **Untested settings:**
  - A _successful_ email confirmation (`/auth/confirm`, PKCE or token-hash) isn't exercised:
    confirmations are off locally. Invalid and malicious links are E2E-tested to fail safely.
  - Production auth settings (confirmations on, password length 8, redirect URLs) must be set in the Supabase
    dashboard. Not done; there's no project.
- **Proxy fails hard on missing env:** if Supabase env vars are missing at runtime, `src/proxy.ts` throws
  on every request. This is intentional (misconfiguration should be loud) but means a misconfigured deploy
  serves 500s.
- **CI:** the new CI job hasn't run on GitHub. It assumes Docker on `ubuntu-latest` and that the
  `supabase start -x …` service names stay valid.
- **Defence in depth:** server functions still rely on RLS alone for some membership checks (review L5).
  There's no actual hole; an explicit app-side membership check is deferred.
- **CI actions** are pinned by tag, not by commit SHA (review L6). Deferred.
- **Local data:** the local database holds test users created by E2E runs. It's throwaway; `npx supabase db reset` clears it.

## Security review and hardening (follow-up, same day)

At your request I ran the read-only `security-reviewer` agent on all Phase 1 changes. It found **no
critical or high issues**. I reproduced each concrete finding myself against the local database (in
rolled-back transactions) or in the library source before fixing it.

| Finding | Severity | Reproduced | Fix |
| --- | --- | --- | --- |
| M1: provider could republish an experience an admin unpublished or archived | Medium | Yes: status went back to `published` | `moderation_locked`, set by trigger on admin unpublish/archive; members can't publish locked rows or write the flag |
| M2: legal and contact details editable at any status | Medium | Yes: a verified provider's legal name changed | Private details editable only in `draft`/`rejected`; public profile frozen while `pending_review` |
| L1: length checks bypassed with whitespace padding | Low–Med | Yes: a 200,003-character `display_name` stored | `col = btrim(col)` constraints on all length-checked text |
| L2: `created_by` and `actor_id` user ids readable | Low | Yes: `has_column_privilege` returned true | Column-level select grants without them |
| L3: default privileges on the audit-log sequence | Low | Yes: `anon=rwU` | Revoked; trigger functions also lose `PUBLIC` execute |
| PKCE links rejected by `/auth/confirm` | Bug | Yes: `flowType: "pkce"` in the library | Route accepts `code` (PKCE) and `token_hash` |
| S1: runbook selected the admin by email | Medium (plausible) | n/a (process) | Runbook selects by verified user id, requires confirmations on; `/account` shows the Account ID |
| L6: `npx supabase status` auto-allowed; narrow `.env` deny list | Low | Yes (settings content) | Allow removed and `supabase status` denied; `.env` deny patterns widened (`.env.example` stays readable). Approved by you |

**New migration:** `20261012133752_security_hardening`.

**New tests:**

- `supabase/tests/security_review.test.sql` (32 assertions): all findings above, plus the RPC and
  membership gaps the reviewer listed.
- `supabase/tests/privileges.test.sql` (38 assertions): catalog-level checks. Table, function and
  sequence inventories; table, column, function and schema privileges; RLS on every table;
  `search_path` pinned on every `security definer` function.
- 4 E2E cases for invalid confirmation links, including an off-site `next`.

**Proof the tests catch the holes:** I re-introduced the five original weaknesses (dropped the moderation
trigger, restored any-status detail edits, dropped a trim constraint, re-granted anon `select` and
sequence privileges). Nine assertions failed across the suites, and a clean reset was back to 158/158.

**Runbook verified:** I executed the documented SQL verbatim against a local account. The check query
showed it confirmed and recently signed in; the first grant inserted 1 row; the second inserted 0.

**Deferred (need decisions):** S2 and L4 rate limiting or a CAPTCHA, application caps and slug
reservation, L5 explicit app-side membership checks, L6 SHA-pinning CI actions.

## Environment variables or manual steps required

1. **Locally:** `npx supabase start`, then `npm run env:local`, then `npm run dev`. `SUPABASE_SECRET_KEY` isn't needed.
2. **Per hosted environment, later:**
   - Create the Supabase project.
   - Apply the migrations with explicit approval (`supabase db push`, which is denied in the Claude settings).
   - Configure auth settings in the dashboard: confirmations on, password length 8, leaked-password
     protection, an exact redirect allow-list, and optionally the token-hash email template from
     `docs/operations/ENVIRONMENTS.md`.
   - Set the three `NEXT_PUBLIC_*` vars in Vercel.
   - Run the admin bootstrap runbook once.
3. Never run `supabase/seed.sql` against a hosted environment.

## Follow-up tasks

1. Review and commit this change (suggested message: `feat: phase 1 identity, provider verification and catalogue`).
2. Push to a GitHub remote so the new CI job runs, and fix anything environment-specific.
3. **Recommended next task:** admin destination management, plus experience editing for providers (field
   edits, with the publish rule unchanged), so the catalogue can be curated without SQL. Then consider
   `'use cache'` for `/explore`.
4. Later: provider staff invitations, application rate limiting, and a decision on re-review of live edits
   if needed (new ADR).
