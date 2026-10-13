# Deployment

Status: **not deployed.** The GitHub repository exists and CI runs on it; no Vercel project or Supabase
cloud project exists yet. Go-live gates are in [RELEASE_CHECKLIST](RELEASE_CHECKLIST.md).

## Target setup

- **Vercel Git integration:** every PR gets a preview deployment; merges to `main` deploy production.
  Vercel deploys; GitHub Actions only validates.
- **Region:** functions in `bom1` (Mumbai) via `vercel.json`; Supabase projects in `ap-south-1`.
- **Supabase:** a staging project (previews) and a production project ([ENVIRONMENTS](ENVIRONMENTS.md)).
- Node.js runtime (Vercel default, Fluid Compute); no Edge runtime.

## One-time setup (manual, per environment)

1. Import the GitHub repository in Vercel (framework Next.js; build `npm run build`; install `npm ci`).
2. Create the Supabase project in `ap-south-1`. Enable `pg_cron` (Database → Extensions) **before**
   applying migrations: the bookings migration schedules `himverse-booking-sweep` every 15 minutes.
3. Apply migrations (below). Do **not** run `supabase/seed.sql` outside local development.
4. Set Vercel environment variables per environment from [.env.example](../../.env.example). Preview must
   use the staging project, never production. Leave `AI_GATEWAY_API_KEY` unset on Vercel (OIDC).
5. Supabase Auth: Site URL and exact redirect allow-list (including `<site>/auth/confirm`), email
   confirmations on, leaked-password protection, minimum length 8, CAPTCHA, custom SMTP
   ([ENVIRONMENTS](ENVIRONMENTS.md), [RELEASE_CHECKLIST](RELEASE_CHECKLIST.md)).
6. Bootstrap the first admin with the runbook in
   [AUTHORIZATION_AND_RLS](../security/AUTHORIZATION_AND_RLS.md).
7. Branch protection on `main`: require CI checks and one review.

## Migration runbook

Migrations are forward-only and applied **before** the code that needs them. Each must be compatible
with the code currently deployed (expand → migrate → contract).

1. **Review:** the PR's CI ran `supabase db reset`, all pgTAP suites, the integration tests and the
   types-drift check against the migration.
2. **Back up first** if the migration rewrites or drops data: confirm the latest managed backup/PITR
   point and take a logical dump ([BACKUP_AND_RESTORE](BACKUP_AND_RESTORE.md)).
3. **Staging first:** `npx supabase link --project-ref <staging>` → `npx supabase db push --dry-run` →
   read the list → `npx supabase db push`. Run the staging smoke tests (`npm run test:smoke`).
4. **Production:** the same against the production project, only after staging passes, with explicit
   approval. Then merge/deploy the code.
5. **Verify:** `npx supabase migration list` shows local = remote; `/api/health` is `ok`; the cron job
   still exists (`select jobname from cron.job`).

Never edit an applied migration. Never run `supabase db reset` against a linked project (it wipes it).

### Phase 5 migrations: compatibility note

`20261012183833_security_review_phases_3_4` changes the `save_itinerary_version` signature and drops
`record_itinerary_generation`. Code deployed **before** it can't save itineraries once it's applied, and
code deployed after it can't save without it. With no production deployment yet this is acceptable.
After launch, a change like this must keep the old function until the new code is live (expand →
contract).

## Releasing

Follow [RELEASE_CHECKLIST](RELEASE_CHECKLIST.md) for the first launch; for later releases:

1. PR merged after green CI and review.
2. Migrations applied (runbook above).
3. Vercel deploys `main`; check `/api/health` reports the new `release` SHA.
4. Run `STAGING_BASE_URL=<production url> npm run test:smoke` (read-only checks), then a manual walk
   through the critical journeys.

## Rollback

- **App:** promote the previous deployment in Vercel (instant). Safe only if the database is still
  compatible with that build, which is why migrations must be backward compatible.
- **AI misbehaving or costing too much:** set `AI_ITINERARY_ENABLED=false` (or lower
  `AI_DAILY_GENERATION_LIMIT`) and redeploy the current deployment; the rest of the site is unaffected.
- **Database:** write a forward-fix migration; do not edit applied migrations. For data loss or
  corruption, restore per [BACKUP_AND_RESTORE](BACKUP_AND_RESTORE.md) (PITR first).
