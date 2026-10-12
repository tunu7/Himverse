# Himverse.AI

AI-assisted trip planning for trusted Himalayan tourism experiences, starting with **Arunachal Pradesh**.

Travelers discover curated experiences from verified local providers, generate a personalised itinerary
grounded in our own tourism database, refine it to their budget and constraints, and book what is
actually available.

> **Status:** engineering foundation only. No product features, database schema or AI pipeline are
> implemented yet. See [MVP scope](docs/product/MVP_SCOPE.md) and [roadmap](docs/product/ROADMAP.md).

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
cp .env.example .env.local        # then fill in values (see below)
npm run dev                        # http://localhost:3000
```

### Local Supabase (optional until the first migration lands)

```bash
npx supabase start                 # starts Postgres, Auth, Studio in Docker
npx supabase status                # prints API URL and publishable/secret keys for .env.local
```

The placeholder home page renders without any environment variables. Code that touches Supabase
validates its variables on first use and fails with a clear message listing missing keys.

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
| `npm run verify`       | format:check → lint → typecheck → test → build (pre-PR gate)     |

First E2E run on a machine: `npx playwright install chromium`.

## Repository layout

See [PROJECT_STRUCTURE](docs/architecture/PROJECT_STRUCTURE.md). In short: `src/app` routes,
`src/features` feature modules, `src/server` server-only domain and data access, `src/lib` shared
infrastructure, `supabase/` migrations and RLS tests, `tests/` unit, integration and E2E tests.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). AI coding agents start at [CLAUDE.md](CLAUDE.md).
