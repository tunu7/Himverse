# Environments and deployment

Status: **production live** on Vercel + Supabase with sample content, not launched; no staging
project yet. Production database pushes, env changes and deploys are run by the owner; agents are
blocked from them by `.claude/settings.json`. Go-live gates: [RELEASE_CHECKLIST](RELEASE_CHECKLIST.md).

| Environment | App | Database | Purpose |
| --- | --- | --- | --- |
| Local | `npm run dev` (:3000) | `npx supabase start` (Docker) | Development, tests |
| CI | GitHub Actions | Throwaway local Supabase per run | Quality gates, DB tests, E2E |
| Preview | Vercel preview per PR | Supabase staging project _(not created yet)_ | Review and QA |
| Production | Vercel production (`bom1`) | Supabase production (`ap-south-1`) | Live users |

Previews must **never** use the production database. Keep Supabase projects in `ap-south-1`, next to the
`bom1` functions. Vercel deploys from Git (PR → preview, `main` → production); GitHub Actions only
validates. Node.js runtime (Fluid Compute), no Edge runtime.

## Variables

Documented in [.env.example](../../.env.example), validated in `src/lib/env.ts` and
`src/lib/env.server.ts`.

**When adding a variable,** update `.env.example`, the Zod schema, this table and Vercel together.
`NEXT_PUBLIC_*` values are built into the browser bundle, so never put secrets in them. Env changes
apply only to new deployments.

| Variable | Exposure | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Public | Per environment; auth redirects |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase API URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public | Publishable key; RLS applies |
| `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED` | Public | `false` (default); `true` shows "Continue with Google" once the provider is set up |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | Public | Optional; shown on `/privacy` and `/terms` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Public | Optional; shows the Turnstile check on auth forms (ADR-0010). The secret goes in Supabase, never here |
| `SUPABASE_SECRET_KEY` | Secret | Bypasses RLS. Used only by the payments system path ([SECURITY](../security/SECURITY.md)) |
| `RAZORPAY_KEY_ID` | Server | Optional (`rzp_test_…`); with the next two, enables deposits ([PAYMENTS](PAYMENTS.md)) |
| `RAZORPAY_KEY_SECRET` | Secret | API auth and Checkout signature |
| `RAZORPAY_WEBHOOK_SECRET` | Secret | Webhook signature check |
| `RAZORPAY_ALLOW_LIVE` | Server | `false` (default); `true` only after the ADR-0005 go-live gate |
| `RAZORPAY_API_BASE` | Server | Tests only (fake API); must be `https://api.razorpay.com` on Vercel |
| `CRON_SECRET` | Secret | Bearer secret for `/api/cron/payments` (Vercel Cron sends it) |
| `AI_PROVIDER` | Server | `gateway` (default), `ollama` (ADR-0006) or `mock` (tests) |
| `AI_ALLOW_MOCK` | Server | `false`; mock is refused in production builds unless `true` (E2E only), never on Vercel production |
| `AI_ITINERARY_MODEL` | Server | Default `anthropic/claude-sonnet-5.5` (gateway) or `himverse-planner` (ollama) |
| `OLLAMA_BASE_URL` | Server | Default `http://127.0.0.1:11434/v1`; remote HTTPS only on Vercel |
| `OLLAMA_API_KEY` | Secret | Required on Vercel with Ollama Cloud or an auth proxy |
| `AI_MODEL_TIMEOUT_MS` | Server | Default 45 s (gateway), 180 s (local Ollama), 90 s (remote Ollama) |
| `AI_GATEWAY_API_KEY` | Secret | Local only; Vercel uses OIDC |
| `AI_ITINERARY_ENABLED` | Server | Kill switch (`true` default) |
| `AI_DAILY_GENERATION_LIMIT` | Server | Platform model calls per IST day (default 300; 0 blocks generation) |

**Local:** values live in `.env.local` (gitignored). `npm run env:local` writes it from the local
stack's `supabase status`, including the local stack's secret key. It never prints values, and it
refuses to overwrite without `--force`.

## AI with Ollama

- **Local (free):**
  1. Install and start Ollama: `brew install ollama && brew services start ollama`.
  2. Run `npm run ai:ollama`, which builds `himverse-planner` (`gemma3:4b`, 16k context; Ollama's
     default context truncates our prompts).
  3. Set `AI_PROVIDER=ollama` and restart.

  On an 8 GB Mac, 3–4B models take about 45 s per plan, and 7B models time out. ADR-0006 lists the
  models tested.
- **Production:**
  - **Ollama Cloud:** set `AI_PROVIDER=ollama`, `OLLAMA_BASE_URL=https://ollama.com/v1`,
    `OLLAMA_API_KEY` and `AI_ITINERARY_MODEL` (for example `gpt-oss:120b`). The free tier allows one
    concurrent request.
  - **Self-hosted:** put it behind an HTTPS proxy that checks a bearer token, and use
    `OLLAMA_CONTEXT_LENGTH=16384`.

  `getAiEnv` refuses localhost, plain HTTP, a missing key or a missing model on Vercel.

## One-time setup (per environment)

1. **Vercel:** import the repo (framework Next.js, build `npm run build`, install `npm ci`).
2. **Supabase project** in `ap-south-1`: enable `pg_cron` **before** migrations (the booking sweep and
   unpaid-deposit jobs run every 15 minutes). Apply migrations; never run `supabase/seed.sql` outside
   local.
3. **Vercel env vars:** set them from the table above. Previews use staging. Leave
   `AI_GATEWAY_API_KEY` unset.
4. **Supabase Auth (dashboard, not `config.toml`):**
   - email confirmations on; minimum password length 8; leaked-password protection;
   - an exact Site URL and redirect allow-list: `<site>/auth/confirm`, `<site>/auth/callback` and
     `<site>/auth/reset`;
   - CAPTCHA (see [CAPTCHA](#captcha-turnstile) below) and custom SMTP. The built-in sender allows only a few emails per hour; Resend needs a
     verified domain. Raise the email rate limit afterwards.
5. **TOTP:** Authentication → Multi-Factor → enable TOTP. Partners and admins must enrol before their
   area opens.
6. **Google sign-in** (optional):
   1. In Google Cloud, create an OAuth client (Web, scopes `openid email profile`) with the redirect
      URI `https://<project-ref>.supabase.co/auth/v1/callback`.
   2. Enable Google in Supabase with that client.
   3. Set `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true` and redeploy.

   New Google users choose traveller or partner once, on `/welcome`.
7. **Email templates:**
   - To let people confirm on another device, the "Confirm signup" template can link to
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/account`.
   - Keep the default "Reset password" template. A `token_hash` reset link would allow login CSRF.
8. **First admin:** use the bootstrap runbook in [SECURITY](../security/SECURITY.md#admin-bootstrap-runbook).
9. **Payments (optional):** follow [PAYMENTS](PAYMENTS.md) §1.
10. **Branch protection on `main`:** require CI and one review.

## CAPTCHA (Turnstile)

Turn it on in this order. Enabling CAPTCHA in Supabase before the widget is live refuses every password
sign-in.

1. Cloudflare dashboard → Turnstile → Add widget: add the production domain (and preview domains if
   wanted), mode **Managed**. Copy the **site key** and **secret key**.
2. Vercel → Production: set `NEXT_PUBLIC_TURNSTILE_SITE_KEY=<site key>` and redeploy. The check now
   appears on sign-in, sign-up, forgot password, change password and delete account; tokens are sent but
   not yet enforced.
3. Supabase → Authentication → Attack Protection → **Enable CAPTCHA protection**: provider Turnstile,
   paste the **secret key**. Supabase now refuses password sign-ins and sign-ups without a valid token.
4. Test each form on production. To roll back, turn CAPTCHA off in Supabase first, then unset the key.

For manual testing, Cloudflare's always-pass test keys work locally: site key `1x00000000000000000000AA`
in `.env.local`, and the secret `1x0000000000000000000000000000000AA` under `[auth.captcha]` in
`supabase/config.toml` (then restart Supabase). Leave both off for E2E.

## Sample content (pre-launch)

`supabase/sample-content/apply.sql` adds 8 destinations, **10 sample partners** (each named "… (sample)")
and **16 experiences** between them, each **bookable** on a daily date for the next 60 days (10 places a
day), so instant booking and deposits can be tried end to end (owner decision 2026-10-29). It replaces
the earlier single "Sample listings (not bookable)" provider (applied 2026-10-13). The script is
idempotent and kept outside the migrations; re-run it to extend the dates. Nobody operates these
partners: bookings made with them are confirmed but never served. Remove it before launch with
`npx supabase db query --linked -f supabase/sample-content/remove.sql`, which also deletes bookings made
with the sample partners (it refuses if any has a payment or refund).

To start from an empty catalogue, run `remove-all.sql` the same way. It deletes every destination,
listing (all types), saved itinerary and booking, plus the sample provider; accounts and partners
stay. It refuses to run once any payment or refund exists.

## Migrations

Migrations are forward-only and must stay compatible with the code currently deployed (expand →
migrate → contract). **Apply them before pushing code that uses them**, because Vercel deploys `main`
immediately. A push that goes first breaks production pages.

1. **Review:** CI ran `supabase db reset`, the pgTAP tests, the integration tests and the types-drift
   check.
2. **Back up:** if the migration rewrites or drops data, take a backup first
   ([BACKUP_AND_RESTORE](BACKUP_AND_RESTORE.md)).
3. **Apply:** `npx supabase db push --dry-run`, read the list, then `npx supabase db push`. Use staging
   first, once it exists. Run it from a checkout that contains **only** reviewed migrations.
4. **Verify:**
   - `npx supabase migration list` shows local and remote matching;
   - `/api/health` is `ok`;
   - the cron jobs exist (`select jobname from cron.job`).

Never edit an applied migration. Never run `supabase db reset` against a linked project.

## Releasing and rollback

- **Release:**
  1. Merge after green CI.
  2. Apply migrations.
  3. Push or deploy `main`.
  4. Check that `/api/health` shows the new `release` SHA.
  5. Run `STAGING_BASE_URL=<url> npm run test:smoke` (read-only), then walk the critical journeys.
- **App rollback:** promote the previous Vercel deployment. This only works while the database is
  still compatible with that build.
- **AI problems:** set `AI_ITINERARY_ENABLED=false` (or lower the daily limit) and redeploy.
- **Payments problems:** stop requiring deposits at `/admin/payments`.
- **Database:** write a forward-fix migration. For data loss, use PITR
  ([BACKUP_AND_RESTORE](BACKUP_AND_RESTORE.md)).
- **Exposed key:** rotate it immediately ([INCIDENT_RESPONSE](INCIDENT_RESPONSE.md)).
