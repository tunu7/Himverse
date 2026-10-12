# Environments

| Environment | App                   | Database                                              | Purpose            |
| ----------- | --------------------- | ----------------------------------------------------- | ------------------ |
| Local       | `npm run dev` (:3000) | `npx supabase start` (Docker)                         | Development, tests |
| CI          | GitHub Actions        | None yet (local Supabase in CI once migrations exist) | Quality gates      |
| Preview     | Vercel preview per PR | Supabase staging project (TBD)                        | Review and QA      |
| Production  | Vercel production     | Supabase production project (TBD)                     | Live users         |

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

- Local values in `.env.local` (gitignored). Never commit `.env*` other than `.env.example`.
- Adding a variable: update `.env.example`, the Zod schema, this table, and Vercel settings in the same PR.
- `NEXT_PUBLIC_*` values are inlined at build time and visible to anyone — never put secrets there.
- Rotate keys immediately if exposed ([INCIDENT_RESPONSE](INCIDENT_RESPONSE.md)).
