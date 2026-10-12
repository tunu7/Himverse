# Environments

| Environment | App                   | Database                                                | Purpose                      |
| ----------- | --------------------- | ------------------------------------------------------- | ---------------------------- |
| Local       | `npm run dev` (:3000) | `npx supabase start` (Docker)                           | Development, tests           |
| CI          | GitHub Actions        | Throwaway local Supabase (`npx supabase start`) per run | Quality gates, DB tests, E2E |
| Preview     | Vercel preview per PR | Supabase staging project (TBD)                          | Review and QA                |
| Production  | Vercel production     | Supabase production project (TBD)                       | Live users                   |

Preview deployments must **never** point at the production database.

## Variables

Defined and documented in [.env.example](../../.env.example); validated in `src/lib/env.ts` and
`src/lib/env.server.ts`.

| Variable                               | Exposure | Notes                                            |
| -------------------------------------- | -------- | ------------------------------------------------ |
| `NEXT_PUBLIC_SITE_URL`                 | Public   | Per environment; used for auth redirects         |
| `NEXT_PUBLIC_SUPABASE_URL`             | Public   | Supabase API URL                                 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public   | Publishable (formerly anon) key; RLS applies     |
| `SUPABASE_SECRET_KEY`                  | Server   | Secret (formerly service_role) key; bypasses RLS |

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
- Adding a variable: update `.env.example`, the Zod schema, this table, and Vercel settings in the same PR.
- `NEXT_PUBLIC_*` values are inlined at build time and visible to anyone — never put secrets there.
- Rotate keys immediately if exposed ([INCIDENT_RESPONSE](INCIDENT_RESPONSE.md)).
