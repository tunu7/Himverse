# Project Structure

One responsibility, one location. Directories are created when first needed — no empty placeholders.

```
.
├── CLAUDE.md, AGENTS.md          Agent entry points (AGENTS.md block is managed by `next dev`)
├── .claude/                      Claude Code settings, rules, skills, agents
├── .github/workflows/            CI
├── docs/                         Product, architecture, engineering, security, AI, ops, ADRs
├── reports/tasks/                Task completion reports (YYYY-MM-DD-<slug>.md)
├── public/                       Static assets
├── src/
│   ├── app/                      Routes, layouts, route handlers, error/loading boundaries
│   ├── components/               Shared, feature-agnostic UI
│   ├── features/<feature>/       Feature module (auth, account, providers, admin, discovery)
│   │   ├── components/           Feature UI
│   │   ├── actions.ts            Server Actions ("use server") — validate, authorize, call server/
│   │   └── schemas.ts            Zod input schemas shared by form and action
│   ├── server/<domain>/          "server-only" domain services and queries (auth, profiles, providers, catalog)
│   ├── lib/
│   │   ├── env.ts                Public env schema (+ server env parser)
│   │   ├── env.server.ts         Server-only secret access
│   │   ├── errors.ts             AppError, ActionResult, toLoggedFailure
│   │   ├── validation.ts         parseInput (Zod + FormData)
│   │   ├── redirect.ts           safeRedirectPath (open-redirect guard)
│   │   ├── format.ts             Price/duration display helpers
│   │   └── supabase/             client.ts (browser), server.ts (user context), public.ts (anonymous),
│   │                             errors.ts (SQLSTATE → AppError)
│   ├── types/                    Generated `database.ts` (`npm run db:types`; not hand-edited)
│   └── proxy.ts                  Session refresh + optimistic redirects
├── supabase/
│   ├── config.toml               Local Supabase config (`supabase init`)
│   ├── migrations/               Timestamped SQL migrations (created by `supabase migration new`)
│   ├── seed.sql                  Local-only sample catalogue (no users/admins)
│   └── tests/                    pgTAP tests for RLS and constraints (`supabase test db`)
├── tests/
│   ├── unit/                     Vitest, pure logic
│   ├── integration/              Vitest, against local Supabase (planned)
│   └── e2e/                      Playwright
└── scripts/                      Developer/CI scripts (`write-local-env.mjs`)
```

## Placement rules

| Code                                         | Location                         |
| -------------------------------------------- | -------------------------------- |
| Page/layout/route handler                    | `src/app/`                       |
| UI used by one feature                       | `src/features/<f>/components/`   |
| UI used by 2+ features                       | `src/components/`                |
| Server Action                                | `src/features/<f>/actions.ts`    |
| DB queries, business rules, AI orchestration | `src/server/<domain>/`           |
| Zod schema for user input                    | `src/features/<f>/schemas.ts`    |
| Zod schema for AI output / domain types      | `src/server/<domain>/schemas.ts` |
| Supabase generated types                     | `src/types/database.ts`          |
| Unit tests                                   | `tests/unit/` mirroring `src/`   |

No workspace monorepo: one package keeps tooling simple ([ADR-0001](../decisions/ADR-0001-MODULAR-MONOLITH.md)).
