# Environments

| Environment | App                   | Database                                                | Purpose                      |
| ----------- | --------------------- | ------------------------------------------------------- | ---------------------------- |
| Local       | `npm run dev` (:3000) | `npx supabase start` (Docker)                           | Development, tests           |
| CI          | GitHub Actions        | Throwaway local Supabase (`npx supabase start`) per run | Quality gates, DB tests, E2E |
| Preview     | Vercel preview per PR | Supabase staging project (TBD)                          | Review and QA                |
| Production  | Vercel production     | Supabase production project (TBD)                       | Live users                   |

Preview deployments must **never** point at the production database.

**Region:** Vercel functions run in `bom1` (Mumbai, `vercel.json`). Create both Supabase projects in
`ap-south-1` (Mumbai) so each request's database round trips stay in-region; a cross-region pairing adds
latency to every query.

## Variables

Defined and documented in [.env.example](../../.env.example); validated in `src/lib/env.ts` and
`src/lib/env.server.ts`.

| Variable                               | Exposure | Notes                                                                                                             |
| -------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`                 | Public   | Per environment; used for auth redirects                                                                          |
| `NEXT_PUBLIC_SUPABASE_URL`             | Public   | Supabase API URL                                                                                                  |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public   | Publishable (formerly anon) key; RLS applies                                                                      |
| `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED`      | Public   | `false` (default). `true` shows "Continue with Google" (set up the provider first)                                |
| `SUPABASE_SECRET_KEY`                  | Server   | Secret (formerly service_role) key; bypasses RLS                                                                  |
| `AI_PROVIDER`                          | Server   | `gateway` (default), `ollama` (free local models, ADR-0006) or `mock` (tests only; see `AI_ALLOW_MOCK`)           |
| `AI_ALLOW_MOCK`                        | Server   | `false` (default). Mock refused on Vercel production always, and in any production build unless `true` (E2E only) |
| `AI_ITINERARY_MODEL`                   | Server   | Default `anthropic/claude-sonnet-5.5` (gateway) or `himverse-planner` (ollama)                                    |
| `OLLAMA_BASE_URL`                      | Server   | Default `http://127.0.0.1:11434/v1`. A localhost URL is refused on Vercel preview/production                      |
| `AI_MODEL_TIMEOUT_MS`                  | Server   | Per-call model timeout; default 45000 (gateway) or 180000 (ollama)                                                |
| `AI_GATEWAY_API_KEY`                   | Server   | Local only; on Vercel the gateway uses OIDC. Never `NEXT_PUBLIC_`                                                 |
| `AI_ITINERARY_ENABLED`                 | Server   | Kill switch, `true` (default) / `false`. Takes effect on the next deployment                                      |
| `AI_DAILY_GENERATION_LIMIT`            | Server   | Platform-wide model calls per IST day (default 300; 0 blocks all generation)                                      |

## Local AI with Ollama (free)

1. Install and start Ollama: `brew install ollama && brew services start ollama`.
2. `npm run ai:ollama` pulls `gemma3:4b` and builds `himverse-planner` from it with a 16k-token context.
   Ollama's OpenAI-compatible API otherwise truncates our prompts silently.
3. In `.env.local`, set `AI_PROVIDER=ollama` and restart `npm run dev`.

To switch local models, run `npm run ai:ollama -- <model>` (for example `qwen2.5:7b`); no env change is
needed. To use a model tag directly, set `AI_ITINERARY_MODEL=<tag>`, but make sure it has a context
window of at least 16k tokens. For Claude or another hosted model, set `AI_PROVIDER=gateway` and
`AI_ITINERARY_MODEL=<provider/model>`. On an 8 GB Mac, 7B models with a 16k context don't fit in GPU memory
and time out; 3–4B models run in about 45 s per plan. ADR-0006 lists the models tested.

## Rules

- Local values in `.env.local` (gitignored). For the local stack, `npm run env:local` writes it from
  `npx supabase status` (public values only, never printed; refuses to overwrite without `--force`).
  Never commit `.env*` other than `.env.example`.
- `SUPABASE_SECRET_KEY` is not needed by any Phase 1 code path; leave it unset locally.
- **Production auth settings** live in the Supabase dashboard, not `config.toml`: enable email
  confirmations (required by the admin bootstrap runbook), minimum password length 8, leaked-password
  protection, and an exact Site URL / redirect URL allow-list including `<site>/auth/confirm`.
- **Confirmation links:** `/auth/confirm` accepts both formats. The default (PKCE, `?code=`) works only
  in the browser that signed up. To support confirming on another device, change the "Confirm signup"
  email template to link to
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/account`. Only `signup` and
  `email_change` token types are accepted; magic-link, recovery and invite links are refused.
- **Google sign-in** (Supabase OAuth with PKCE; `/auth/google` → Google → Supabase →
  `/auth/callback`):
  1. Google Cloud Console → APIs & Services → OAuth consent screen (External; app name, support
     email, `openid`/`email`/`profile` scopes only), then Credentials → OAuth client ID → Web
     application. Authorised redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
  2. Supabase → Authentication → Sign In / Providers → Google: enable, paste the client ID and
     secret (stored by Supabase, never in this repo or Vercel).
  3. Supabase → Authentication → URL Configuration → Redirect URLs: add
     `<site>/auth/callback` (as well as `<site>/auth/confirm`).
  4. Vercel: `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true`, then redeploy (public values are built in).
     Google accounts sign in as travellers; roles still come only from `user_roles`. A Google sign-in
     with the same verified email as an existing password account is linked to it by Supabase.
- Adding a variable: update `.env.example`, the Zod schema, this table, and Vercel settings in the same PR.
- `NEXT_PUBLIC_*` values are inlined at build time and visible to anyone — never put secrets there.
- Rotate keys immediately if exposed ([INCIDENT_RESPONSE](INCIDENT_RESPONSE.md)).
