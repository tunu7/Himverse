# Himverse.AI

AI-assisted trip planning for trusted Himalayan tourism experiences, starting with **Arunachal Pradesh**.

Travelers discover curated experiences from verified local providers, generate a personalised itinerary
grounded in our own tourism database, refine it to their budget and constraints, and book what is
actually available.

> **Status:** Phases 1–2 (identity, provider verification, catalogue, public discovery) are green in
> CI. Phase 3 (AI itineraries at `/itineraries`, via Vercel AI Gateway) is implemented locally and
> verified with a mock model only. Not deployed. No bookings or payments yet. See the
> [roadmap](docs/product/ROADMAP.md).

## Tech stack

Next.js 16 (App Router, Cache Components) · React 19 · TypeScript (strict) · Tailwind CSS 4 ·
Supabase (Auth, Postgres, Row Level Security) · Zod · Vitest · Playwright · Vercel.
Rationale: [TECH_STACK](docs/architecture/TECH_STACK.md).

## Prerequisites

- Node.js **22+** and npm 10+
- Docker (only for running Supabase locally and database/RLS tests)

## Getting started

```bash
npm ci
npx supabase start                 # Postgres, Auth, Studio in Docker; applies migrations + seed.sql
npm run env:local                  # writes .env.local for the local stack (values not printed)
npm run dev                        # http://localhost:3000
```

Useful local commands:

```bash
npx supabase db reset              # rebuild the LOCAL database from migrations + seed (local data only)
npm run db:test                    # pgTAP RLS tests
npm run db:types                   # regenerate src/types/database.ts after a migration
```

The first administrator is created with a one-time SQL runbook, never from the app:
[admin bootstrap runbook](docs/security/AUTHORIZATION_AND_RLS.md#admin-bootstrap-runbook).
Local email confirmation is off; sign up at `/sign-up` and you're signed in immediately.

## Scripts

| Script                 | Purpose                                                          |
| ---------------------- | ---------------------------------------------------------------- |
| `npm run dev`          | Development server                                               |
| `npm run build`        | Production build                                                 |
| `npm run start`        | Serve the production build                                       |
| `npm run lint`         | ESLint (Next.js core-web-vitals + TypeScript rules)              |
| `npm run typecheck`    | Generate route types and run `tsc --noEmit`                      |
| `npm run format`       | Prettier write                                                   |
| `npm run format:check` | Prettier check (used in CI)                                      |
| `npm test`             | Vitest unit + integration tests                                  |
| `npm run test:e2e`     | Playwright E2E against `next start` on port 3100 (build first)   |
| `npm run db:test`      | Supabase pgTAP tests (`supabase/tests`), requires local Supabase |
| `npm run db:types`     | Regenerate `src/types/database.ts` from the local schema         |
| `npm run env:local`    | Write `.env.local` for the local Supabase stack                  |
| `npm run verify`       | format:check → lint → typecheck → test → build (pre-PR gate)     |

First E2E run on a machine: `npx playwright install chromium`.

## Repository layout

See [PROJECT_STRUCTURE](docs/architecture/PROJECT_STRUCTURE.md). In short: `src/app` routes,
`src/features` feature modules, `src/server` server-only domain and data access, `src/lib` shared
infrastructure, `supabase/` migrations and RLS tests, `tests/` unit, integration and E2E tests.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). AI coding agents start at [CLAUDE.md](CLAUDE.md).
