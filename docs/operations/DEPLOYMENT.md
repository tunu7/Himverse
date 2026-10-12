# Deployment

Status: **not deployed.** No Vercel project, GitHub remote or Supabase cloud project is connected yet.

## Target setup

- **Vercel Git integration:** every PR gets a preview deployment; merges to `main` deploy production.
  Deployment is performed by Vercel, not by our GitHub Actions — CI only validates.
- **Supabase:** separate projects for preview/staging and production ([ENVIRONMENTS](ENVIRONMENTS.md)).
- Node.js 22+ runtime (Vercel default Node runtime); no Edge runtime.

## One-time setup (manual)

1. Create the GitHub repository and push `main`.
2. Import the repository in Vercel (framework: Next.js; build `npm run build`; install `npm ci`).
3. Create Supabase projects; set environment variables in Vercel per environment (Preview, Production)
   from [.env.example](../../.env.example).
4. Enable the `pg_cron` extension (Database → Extensions) before applying the bookings migration;
   it schedules `himverse-booking-sweep` every 15 minutes.
5. Configure Supabase Auth site URL and redirect URLs for production and preview domains.
6. Enable branch protection on `main`: require CI checks and one review.

## Releasing

1. PR merged after green CI and review.
2. **Migrations first:** apply pending migrations to the target Supabase project
   (`npx supabase db push --linked`) before or together with the deploy that needs them. Migrations must be
   backward compatible with the currently deployed code (expand → migrate → contract).
3. Vercel builds and deploys `main`.
4. Smoke-test critical paths on production.

Automated migration application in CI is deferred until credentials and an approval gate exist (ADR).

## Rollback

- App: promote the previous deployment in Vercel (instant rollback).
- Database: write a forward-fix migration; do not edit applied migrations. Destructive migrations require
  a backup/restore plan in the PR.
