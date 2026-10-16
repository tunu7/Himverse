# Task Report: Phase 5 — Production readiness (Workstream A)

- Date: 2026-10-13
- Author: Claude Code (Opus 5.5)
- Scope approved: **Workstream A only** (local work, no accounts). Workstream B (hosted environments,
  Sentry, Resend, CAPTCHA, SMTP) and C (Razorpay sandbox) are **not started**.
- Nothing deployed; no remote database touched; no payment credentials.

## Summary of changes

- **Security headers + CSP** (`next.config.ts`), `X-Powered-By` removed; E2E-tested, including a check
  that fails on blocked or wrongly upgraded requests. `upgrade-insecure-requests` was removed after the
  smoke suite showed it broke protected-link prefetches on plain-HTTP builds (mutation-verified).
- **Database rate limits** (migration `20261012183454`): booking requests, provider applications,
  dates per experience; SQLSTATE `54000` → `RATE_LIMITED`.
- **AI cost controls:** kill switch `AI_ITINERARY_ENABLED`, platform cap `AI_DAILY_GENERATION_LIMIT`.
- **Security review fixes for Phases 3–4** (migration `20261012183833`):
  - M1: generations reserved atomically before the model call (`begin_itinerary_generation`, advisory
    lock); `finish_itinerary_generation` replaces `record_itinerary_generation`.
  - M2: `save_itinerary_version` requires and consumes the caller's pending reservation; travellers
    must match preferences; no duplicate experiences.
  - M3: only verified providers add dates, ≤ 2 years ahead; ≤ 200 experiences per provider; provider
    booking list filtered by membership (admins no longer see every booking there) and recency; date
    list future-only.
  - L1 total cap, L2 `actor_id` hidden, L4 no existence oracle in `request_booking`, L5 integration-DB
    guard parses the URL, L6 mock model refused in any production build unless `AI_ALLOW_MOCK=true`,
    L7 blank titles rejected and long refinements fit the prompt budget. L3 and the L1 policy question
    are recorded in BOOKING_POLICY (questions 9–10).
- **Observability:** `src/lib/logger.ts` (JSON lines, redaction), `/api/health`, monitoring SQL and
  alert thresholds in OBSERVABILITY.
- **Ops:** `vercel.json` (`bom1`), DEPLOYMENT runbook (migrations, rollback), RELEASE_CHECKLIST,
  BACKUP_AND_RESTORE (local drill), incident runbooks, read-only staging smoke suite
  (`npm run test:smoke`), ADR-0005 Razorpay design (Proposed).

## Verification (actually run)

| Check | Result |
| --- | --- |
| pgTAP (`npm run db:test`) after the review migration | **PASS: 11 files, 307 assertions** |
| Integration (`npm run test:integration`) | **4/4** (15 parallel reservations → exactly 10 succeed, 5 × `54000`) |
| Mutation: advisory lock removed | Integration test failed (15 succeeded); DB reset restored |
| Mutation: `upgrade-insecure-requests` restored | CSP E2E failed on `https://localhost` redirects; config restored |
| Integration guard vs crafted URLs | All 3 rejected (one passed the old regex) |
| Format / lint / typecheck (final tree) | Pass |
| Unit tests (final tree) | **236/236** in 19 files |
| Build with env | Pass (final tree) |
| E2E, CI-like, after the review fixes (before logger/health/CSP tweak) | **48/48** |
| Health + security-header E2E after adding `/api/health` | Pass; DB paused → 503 `degraded` in 3 s, then 200 after unpause |
| Staging smoke suite against local `next start` (localhost) | 5/5 after the CSP fix |
| Performance at ~5k experiences / 100k dates / 50k bookings / 100k logs | Pages 13–30 ms; listing/search 120–150 ms (linear RLS cost, documented threshold); hot SQL paths 0.2–9 ms |
| Backup/restore drill (local) | Counts + checksum identical; found and documented a `pg_dump --schema/--table` pitfall |
| Monitoring SQL in OBSERVABILITY | All 8 queries run locally |

## Not verified on the final tree

The local Docker engine became unresponsive (memory pressure after the scale test) during the final
gate, so these were **not re-run on the final commit**: pgTAP, integration, types-drift, build without
env, full E2E, `npm audit`. GitHub CI on this commit is the authoritative run for them. Docker Desktop
needs a restart locally.

## Release status: **NO-GO**

Blockers remaining (see RELEASE_CHECKLIST): hosted environments (B1), error tracking/uptime alerting
(B6), booking notifications (B7), production auth (SMTP, CAPTCHA, B8), managed backups/PITR verified on
staging (B9), privacy policy/terms/DPDP and account deletion (B10). Payments stay off until ADR-0005's
sandbox gate passes.

## Operational risks

- Global AI cap can overshoot slightly under concurrency (cost guard, not exact quota).
- Kill switch and limit changes need a redeploy on Vercel.
- Hosted data-only restore needs superuser for circular FKs; rely on PITR (to verify on staging).
- The review migration changes RPC signatures; future changes of this kind must expand → contract.
