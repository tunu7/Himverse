# Release checklist (first launch)

Every item needs evidence (a link, a command output, or a screenshot) in the release report. "Builds
locally" proves nothing about production. Status as of the Phase 5 report: see
`reports/tasks/2026-10-13-phase5-production-readiness.md`.

Launch scope: discovery, AI itineraries and booking **requests** (no online payments; ADR-0005).

## 1. Code and tests (CI)

- [ ] CI green on the release commit: format, lint, typecheck, unit, pgTAP, integration, types drift,
      build, E2E.
- [x] `npm audit --omit=dev` reviewed; no unaccepted production advisories. (2026-10-15: 0 production
      advisories; 5 high in dev-only lint tooling (`braces` via `eslint-config-next`), accepted: no
      production exposure, fix would downgrade Next's lint config.)
- [x] Secret scan of the repository and the browser bundle clean. (2026-10-15; only a deliberately
      fake value in `tests/unit/env.test.ts`.)

## 2. Environments

- [ ] Vercel project created, region `bom1`, Git integration on, preview → staging DB.
- [ ] Supabase staging and production projects in `ap-south-1`; `pg_cron` enabled; migrations applied;
      `supabase migration list` matches.
- [ ] Environment variables set per environment; `AI_PROVIDER` is `gateway`, or `ollama` with a remote
      `OLLAMA_BASE_URL`, `OLLAMA_API_KEY` and model (ENVIRONMENTS.md); `AI_ALLOW_MOCK` unset;
      `AI_DAILY_GENERATION_LIMIT` set deliberately; no `NEXT_PUBLIC_` secrets.
- [ ] AI Gateway spend limit/alert configured in Vercel.
- [ ] Domain, HTTPS and `NEXT_PUBLIC_SITE_URL` set.

## 3. Authentication

- [ ] Supabase Auth: email confirmation on, leaked-password protection, minimum length 8.
- [ ] **Custom SMTP** configured (Resend via Marketplace). The default Supabase mailer is rate limited
      and not for production.
- [ ] **CAPTCHA** (Turnstile, ADR-0010; code ready behind `NEXT_PUBLIC_TURNSTILE_SITE_KEY`): site key
      deployed **first**, then CAPTCHA enabled in Supabase Auth ([ENVIRONMENTS](ENVIRONMENTS.md#captcha-turnstile));
      sign-in, sign-up, forgot password, change password and delete account tested on production.
- [ ] Site URL and redirect allow-list exact; confirmation email template set; tested end to end on
      staging (sign up → confirm → sign in) on a second device.
- [ ] Google sign-in (if enabled): OAuth client in Google Cloud, provider enabled in Supabase,
      `<site>/auth/callback` in the redirect allow-list, `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true`;
      tested end to end (new Google user, cancelled consent, existing email account).
- [ ] First admin bootstrapped with the runbook; no other admins.

## 4. Notifications (blocker for booking requests)

- [ ] Providers are told about new requests and travellers about confirmations, declines and expiries
      (email via Resend). Without this, requests silently expire after 48 h. _In-app alerts are done
      (ADR-0009): a partner-portal bar and menu counts, traveller "updated" labels. Email still needs a
      sending domain._

## 5. Observability and operations

- [ ] Error tracking (Sentry) receiving server and client errors with release tags; CSP `connect-src`
      updated. _Waiting on the owner to accept the Sentry terms in the Vercel Marketplace._
- [ ] Uptime monitor on `/api/health` alerting the on-call owner.
- [ ] Monitoring SQL from [OBSERVABILITY](../engineering/OBSERVABILITY.md) run on staging; owner and
      cadence agreed.
- [ ] `cron.job_run_details` shows the sweep succeeding on production.
- [ ] Incident contacts filled in [INCIDENT_RESPONSE](INCIDENT_RESPONSE.md).

## 6. Data protection and legal

- [ ] Production on a plan with daily backups; PITR enabled; RPO/RTO agreed.
- [ ] Restore rehearsed on staging ([BACKUP_AND_RESTORE](BACKUP_AND_RESTORE.md)).
- [ ] Privacy policy and terms published (DPDP Act 2023 review), including AI-generated content and
      booking-request disclaimers. _`/privacy` and `/terms` are published and describe how the platform
      works today; legal review is still needed. Set `NEXT_PUBLIC_SUPPORT_EMAIL` for the contact line._
- [x] Account deletion and data-access request process (at least manual, documented). Self-serve
      deletion in account settings (ADR-0009); data access: the account, bookings and trips pages show
      everything held about the user.
- [ ] Contact-phone retention decided (BOOKING_POLICY question 10).

## 7. Verification on staging

- [ ] `STAGING_BASE_URL=<staging> npm run test:smoke` passes.
- [ ] Manual journeys on staging: sign up/confirm; provider application → admin verification →
      experience → dates; traveller request → provider confirm/decline → cancel; AI itinerary generate,
      refine, rate limit message; kill switch off/on (with redeploy).
- [ ] Security headers checked on the staging domain (e.g. securityheaders.com), no CSP violations in
      the console.

- [ ] Sample content removed (`supabase/sample-content/remove.sql`, or `remove-all.sql` for an empty catalogue). The sample
      partners are **bookable** (testing instant booking, 2026-10-29), so they must not stay live at launch.

## 8. Go / no-go

- [ ] Rollback rehearsed: promote previous deployment on staging.
- [ ] Owner sign-off recorded with the open risks accepted in writing.
