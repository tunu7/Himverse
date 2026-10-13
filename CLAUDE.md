# CLAUDE.md — Himverse.AI

@AGENTS.md

Himverse.AI is an AI-assisted Himalayan tourism platform. Travelers discover curated experiences from
verified providers, generate and refine itineraries grounded in **our own trusted tourism database**,
and book available experiences. Launch region: Arunachal Pradesh. Scope: [MVP_SCOPE](docs/product/MVP_SCOPE.md).

## Stack (verify versions in `package.json`)

Next.js 16 App Router (Cache Components on, `proxy.ts` not middleware) · React 19 · TypeScript strict ·
Tailwind CSS 4 · Supabase (Auth, Postgres, RLS) · Zod 4 · Vitest · Playwright · npm · Vercel.
Next.js 16 differs from older versions: read `node_modules/next/dist/docs/` before using an API.

## Architecture in one screen

Modular monolith ([ADR-0001](docs/decisions/ADR-0001-MODULAR-MONOLITH.md)). Dependencies point downward only:

```
src/app/            routes, layouts, route handlers — thin; compose features
src/features/<x>/   feature UI, server actions, feature schemas
src/server/         server-only domain services + data access ("server-only")
src/lib/            cross-cutting infra: env, supabase clients, errors
src/components/     shared, feature-agnostic UI
supabase/           migrations/ and tests/ (pgTAP RLS tests)
tests/              unit/, integration/, e2e/, smoke/ (deployed env, read-only)
```

Authorization model: [ADR-0002](docs/decisions/ADR-0002-AUTHORIZATION-MODEL.md) (roles in `user_roles`,
provider authority via membership, all enforced by RLS). Details: [PROJECT_STRUCTURE](docs/architecture/PROJECT_STRUCTURE.md), [ARCHITECTURE](docs/architecture/ARCHITECTURE.md).

## Non-negotiable rules

1. **Secrets:** `SUPABASE_SECRET_KEY` and any credential live only in server code (`src/lib/env.server.ts`,
   `src/server/**`). Never prefix secrets with `NEXT_PUBLIC_`. Never read or print `.env*` files other than `.env.example`.
2. **Validate at boundaries** with Zod: form data, route params, search params, webhook bodies, env, and AI output.
3. **RLS on every table**, enabled in the same migration that creates it. Schema changes only via `supabase/migrations/`.
4. **AI output is untrusted.** Validate it, reference catalogue items only by IDs that exist in our DB, store it apart
   from curated data, and never present it as availability, price or booking confirmation.
5. **Bookings:** confirm only from authoritative provider/payment state; every mutating booking or payment operation is idempotent.
6. **No `any`** without an inline justification comment. No disabled tests, skipped checks, or weakened RLS to get green.
7. **Minimal dependencies and infrastructure.** New services, libraries or patterns of significance need an ADR.
8. UI handles loading, empty, success and error states explicitly.

Scoped detail lives in `.claude/rules/` (auto-applied by path) and [CODING_STANDARDS](docs/engineering/CODING_STANDARDS.md).

## Commands

```bash
npm run dev            # local dev server
npm run verify         # format:check + lint + typecheck + unit tests + build  (run before finishing)
npm run test:e2e       # Playwright against a production build on :3100 (run `npm run build` first)
npm run db:test        # pgTAP RLS tests (needs Docker + `npx supabase start`)
npm run db:types       # regenerate src/types/database.ts after any migration
```

Never claim a check passed unless you ran it in this session and saw it pass.

## Workflow for every change

Follow [DEVELOPMENT_WORKFLOW](docs/engineering/DEVELOPMENT_WORKFLOW.md): inspect → clarify acceptance criteria →
identify affected modules/tables/security boundaries → plan + risks → smallest complete change → tests →
verify → review → update docs/ADRs → **task report** in `reports/tasks/YYYY-MM-DD-<slug>.md` from
[TASK_REPORT_TEMPLATE](docs/engineering/TASK_REPORT_TEMPLATE.md).

Skills: `/implement-feature`, `/db-migration-rls`, `/verify`, `/production-review`.

## Documentation map

- Product: [PRD](docs/product/PRD.md) · [MVP_SCOPE](docs/product/MVP_SCOPE.md) · [USER_FLOWS](docs/product/USER_FLOWS.md) · [ROADMAP](docs/product/ROADMAP.md)
- Architecture: [ARCHITECTURE](docs/architecture/ARCHITECTURE.md) · [SYSTEM_DESIGN](docs/architecture/SYSTEM_DESIGN.md) · [TECH_STACK](docs/architecture/TECH_STACK.md)
- Engineering: [TESTING_STRATEGY](docs/engineering/TESTING_STRATEGY.md) · [ERROR_HANDLING](docs/engineering/ERROR_HANDLING.md) · [OBSERVABILITY](docs/engineering/OBSERVABILITY.md)
- Data/API: [DATABASE_DESIGN](docs/database/DATABASE_DESIGN.md) · [DATA_ACCESS_PATTERNS](docs/database/DATA_ACCESS_PATTERNS.md) · [API_CONTRACTS](docs/api/API_CONTRACTS.md) · [VALIDATION](docs/api/VALIDATION.md)
- Security: [SECURITY](docs/security/SECURITY.md) · [AUTHORIZATION_AND_RLS](docs/security/AUTHORIZATION_AND_RLS.md)
- AI: [AI_ARCHITECTURE](docs/ai/AI_ARCHITECTURE.md) · [ITINERARY_GENERATION](docs/ai/ITINERARY_GENERATION.md) · [AI_EVALUATION](docs/ai/AI_EVALUATION.md)
- Ops: [DEPLOYMENT](docs/operations/DEPLOYMENT.md) · [ENVIRONMENTS](docs/operations/ENVIRONMENTS.md) · [INCIDENT_RESPONSE](docs/operations/INCIDENT_RESPONSE.md) · [BACKUP_AND_RESTORE](docs/operations/BACKUP_AND_RESTORE.md) · [RELEASE_CHECKLIST](docs/operations/RELEASE_CHECKLIST.md)
- Decisions: [docs/decisions](docs/decisions/README.md)
