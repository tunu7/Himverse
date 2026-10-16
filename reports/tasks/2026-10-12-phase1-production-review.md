# Task Report: Phase 1 production review

- Date: 2026-10-12
- Author: Claude Code (Opus 5.5), using the `production-review` skill
- Branch / commit: `main`, **uncommitted** on top of `f2da8ce` (no commit, push or deploy)
- Implementation report: [2026-10-12-phase1-identity-authorization.md](2026-10-12-phase1-identity-authorization.md)

## Objective and scope

Audit the completed Phase 1 implementation: the actual code and migrations, not just the docs. Scope:
auth and session, RLS and grants, role escalation, provider verification, cross-user and cross-provider
access, SQL injection and unsafe server operations, validation, error handling, secrets, test coverage,
regression risk, and consistency with CLAUDE.md. Fix confirmed defects within Phase 1 scope. No commit,
no Phase 2.

## Method

1. Scoped the uncommitted changes against `f2da8ce`: 54 paths.
2. Ran an independent pass with the read-only `security-reviewer` agent (the second one; the first was
   before hardening), focused on the not-yet-reviewed hardening code.
3. Did my own review:
   - static checks: dynamic SQL, unsafe HTML, query placement, action validation, skipped tests, unused
     exports, Suspense states;
   - a check of CLAUDE.md, the coding standards and the testing strategy against the code.
4. **Reproduced every finding before fixing it,** in rolled-back transactions on the local database or by
   reading library source.
5. After each fix: **mutation-checked** the new tests by putting the weakness back and confirming the
   tests fail, then reset.

## Verdict

**No blocker, critical or high findings.** The authorization model holds: no role escalation, no
cross-user or cross-provider access, no SQL injection, no secret-key use. Confirmed defects were fixed
and are pinned by tests. The medium Claude-settings item (M-2) was applied after your explicit approval.

## Findings and fixes

| ID | Severity | Finding | Confirmed by | Fix | Test that pins it |
| --- | --- | --- | --- | --- | --- |
| M-1 | Medium (should-fix) | `privileges.test.sql` blind spots: a new view, a new function overload, or a new column inherits Supabase's default grants and the suite still **PASSES** | Created a view over `provider_private_details` (anon could select) and a `review_provider(uuid,text)` overload (anon could execute): suite reported PASS | Added no views/materialized views/foreign tables in `public`; an exact EXECUTE snapshot for API roles (public and private); an exact column-privilege snapshot | `privileges.test.sql` tests 39–41; mutation run: all 3 fail |
| A-1 | Medium (should-fix, mine) | Sign-in mapped **every** auth error to "Email or password is incorrect.", including rate limits and Supabase outages. Outages were unlogged and looked like wrong passwords | Code reading (`src/features/auth/actions.ts`) | `src/server/auth/auth-errors.ts`: rate limit → `RATE_LIMITED`; outage → `UPSTREAM_UNAVAILABLE` (logged); unconfirmed email explained; credential failures and sign-up conflicts stay generic | `tests/unit/auth-errors.test.ts` (7 tests, including no account discovery) |
| A-2 | Medium (coverage, mine) | The critical journey (verify → publish → visible → suspend → hidden) had **no committed E2E test**, only my uncommitted scratch script | Test inventory | `tests/e2e/provider-lifecycle.spec.ts`: grants admin by Account ID through `supabase db query --local` (runbook path, local only) and revokes it afterwards | Itself (passes; leaves 0 admins) |
| A-3 | Low (consistency, mine) | TESTING_STRATEGY requires every Server Action's validation and authorization failure paths to be tested; they weren't at action level | Doc vs tests | `tests/unit/actions.test.ts`: 6 actions × (tampered input rejected before the server layer; UNAUTHENTICATED/FORBIDDEN/NOT_FOUND surfaced safely; unexpected errors hidden) | Itself (30 tests) |
| L-2 | Low | Moderation trigger ran as invoker, so any future `service_role` update of `experiences` fails | `permission denied for schema private` as `service_role` | Trigger function is `security definer` | `system_roles.test.sql`; mutation: fails. See note 1 |
| L-4 | Low | A suspended provider could rename its public profile (impersonation), and reinstatement would publish it unreviewed | Suspended provider renamed to "Impersonated Brand" | Profile frozen while `pending_review` **or** `suspended` | `security_review.test.sql` #33; mutation: fails |
| L-6 | Low | Unexpected errors logged the full database error, whose `details`/`hint` can contain user values | Code reading (`src/lib/errors.ts`) | `summarizeForLog()` keeps only `name`, `code`, `status`, `message` (≤300 chars) | `tests/unit/errors.test.ts` (an email in `details` isn't logged) |
| L-3 | Low | `/auth/confirm` accepted magic-link, recovery and invite tokens on GET, which attackers can mint for their own account (login CSRF) | Code reading | Only `signup` and `email_change` accepted; template docs updated | Existing E2E (`type=email` now refused) |
| A-4 | Nit (mine) | L-4 policy name exceeded Postgres's 63-character limit and was silently truncated | NOTICE on policy drop | Renamed to `members edit own profile unless pending or suspended` | Reset shows no NOTICE |
| L-1 | Low (design) | The moderation lock is per experience; a provider can publish a new copy | Code reading | **Documented** in ADR-0002: suspension is the escalation | n/a |
| L-7 | Low (functional) | Admins have no UI to clear a moderation lock | Code reading | **Documented** as SQL-only for Phase 1 | n/a |

**Note 1, a test-design trap found during mutation checks:** the first L-2 test passed even with the fix
reverted. PL/pgSQL caches a trigger's plans per session, and schema permissions are only checked when the
plan is first built; earlier statements had already run the trigger as `authenticated`. The test now
lives in its own file, where `service_role` fires the trigger first, and the mutation check fails as it
should.

**Note 2, a tooling trap:** `supabase migration new` reads SQL from stdin when it isn't a terminal, so it
hung inside `$(…)` and left an empty migration file. I hit this once during this review: a concurrent
local reset failed, and I wrote the file directly afterwards. Future scripts should run it with
`< /dev/null`.

## M-2: Claude settings (applied with your approval)

**Finding (medium):** `.claude/settings.json` auto-allowed `Bash(git diff:*)`, so
`git diff --no-index /dev/null .env.local` would have printed the local env file without a prompt. I
confirmed this by reading the settings; I didn't run it.

**Applied after your explicit approval:**

- `git diff` is allowed only as exact commands: `git diff`, `--stat`, `--cached`, `--cached --stat`.
  I didn't use `git diff --stat:*`, because a prefix would still allow
  `git diff --stat -p --no-index …`, which prints file contents. Plus a deny for
  `git diff --no-index:*`.
- `git branch` is allowed only as `git branch`, `--show-current` and `--list`. `git branch -D` and
  `--delete --force` are denied.
- Added denies:
  - `supabase db push` (bare and `npm exec` forms), `supabase link`, `supabase secrets`, and
    `db reset --db-url` / `--linked`, in both `npx` and bare forms;
  - `git push` force variants (`--force-with-lease`, `origin --force`, `origin main -f`, `origin +…`);
  - `vercel --prod`;
  - reads of `.env.bak*`, `.envrc` and nested `.env.production*`.
- Validated: valid JSON, Prettier-clean, no wildcard `git diff`/`git branch` allows, no allow/deny
  overlap.

**Known limits:**

- Deny rules are prefix matches, so other argument orders (for example `git push origin feature --force`)
  aren't denied. They still prompt, because no `git push` is allow-listed.
- Test runners in the allow-list execute code the agent can write, so they can't fully contain file reads.
  Changing that would mean moving the test commands to "ask", which I didn't do.

## Checked and found sound

- **Role escalation:** no API write path to `user_roles`. Status columns are writable only by RPCs. The
  privilege snapshot now locks the exact grant surface.
- **Provider verification:** transitions enforced in SQL; no self-review; notes required; reviewed identity
  frozen.
- **Cross-user and cross-provider access:** RLS covers every table. Client-supplied IDs are checked by
  RLS or by RPC ownership checks, which return `P0002` with no existence oracle. Zero-row updates
  become NOT_FOUND.
- **SQL injection:** no dynamic SQL in migrations (no `EXECUTE`/`format` with input). RPC arguments are
  typed. No user-controlled filters or sort. The supabase-js query builder is parameterised.
- **Unsafe server operations:** no secret-key client; `getServerEnv` is unused; nothing uses
  `dangerouslySetInnerHTML`, `eval` or `new Function`; no `console.log` in `src`.
- **Validation:** every input-taking Server Action calls `parseInput` with strict Zod schemas
  (`signOut` takes no input). The confirm route and query params are validated.
- **Sessions:** `getClaims()` everywhere; the proxy is optimistic only; pages and actions re-check; admin
  lookup fails closed.
- **Architecture:** every query is in `src/server` or `src/lib`; client components import only types from
  `src/server`. "Unused" exports are type aliases forming public signatures, plus Phase 0's intentionally
  unused `createSupabaseBrowserClient` and `getServerEnv` (nits).
- **UX:** every route has a Suspense loading state, plus empty and error states and a root `error.tsx`.

## Tests and commands executed (final, from a fresh `npx supabase db reset`)

| Command | Result (actual) |
| --- | --- |
| `npm run db:test` | **PASS: 6 files, 164 assertions** (was 158 in 5 files before this review) |
| Mutation runs (local DB, then reset) | M-1 view, overload, column: 3 failures. L-4: 1 failure. L-2 in its own session: 1 failure. All restored by reset |
| `npm run db:types` + `cmp` | Types up to date |
| `npm run verify` | **Pass**, exit 0: format, lint, typecheck, **106 unit tests in 10 files** (was 67/8), build |
| `npm run test:e2e` | **Pass: 10/10** (was 9): includes the new committed lifecycle test; 0 admins left afterwards |
| Link audit | 47 markdown files, 0 broken links or anchors |
| Secret scan | Clean |
| `npm audit --omit=dev` | 0 vulnerabilities (the dev-only ESLint chain is unchanged) |
| CI on GitHub | **Not run** (no remote) |

## Files changed by this review

- **Created:**
  - `supabase/migrations/20261012135457_review_followups.sql`
  - `supabase/tests/system_roles.test.sql`
  - `src/server/auth/auth-errors.ts`
  - `tests/unit/{auth-errors,actions}.test.ts`
  - `tests/e2e/provider-lifecycle.spec.ts`
  - this report
- **Modified:**
  - `.claude/settings.json` (M-2, after approval)
  - `supabase/tests/{privileges,security_review}.test.sql`
  - `src/features/auth/actions.ts`
  - `src/lib/errors.ts`
  - `src/app/auth/confirm/route.ts`
  - `tests/unit/errors.test.ts`
  - `docs/decisions/ADR-0002-AUTHORIZATION-MODEL.md`
  - `docs/security/AUTHORIZATION_AND_RLS.md`
  - `docs/operations/ENVIRONMENTS.md`

## Remaining risks

1. **Claude settings (M-2):** applied. Deny rules are prefix-based, and test runners can still execute agent-written code (see above).
2. **Login CSRF and link-scanner consumption:** reduced, not removed. An attacker can still send a signup
   link of a fresh account. Fix: a confirmation interstitial that POSTs. A _successful_ confirmation flow
   remains untested locally (confirmations off).
3. **Rate limiting / CAPTCHA:** not done. Auth via Server Actions probably shares Vercel's IP for
   Supabase's limits, and provider applications and slugs are uncapped.
4. **App-side membership checks:** some server functions rely on RLS alone. Correct today, but not
   defence in depth.
5. **Live edits and moderation scope:**
   - Live edits by verified providers aren't re-reviewed (accepted).
   - The moderation lock is per experience (documented).
   - There's no admin UI for experience moderation or lock clearing.
6. **CI:** never run on GitHub. Actions pinned by tag, not SHA. The lifecycle E2E depends on
   `supabase db query --local` in CI.
7. **Privilege snapshot maintenance:** it is intentionally strict. Every new table, column or function
   must update `privileges.test.sql`, which is the point, but expect that friction in Phase 2.
8. **Supabase exposed API schemas** (`config.toml [api].schemas`) aren't asserted by tests. Keep `private`
   out of them in every environment.

## Follow-up tasks

1. Review the diff and commit (suggested: `feat: phase 1 identity, provider verification and catalogue`).
2. Push so CI runs; then fix anything environment-specific.
3. Before production: the confirmation interstitial (risk 2) and a rate-limiting decision (risk 3).
