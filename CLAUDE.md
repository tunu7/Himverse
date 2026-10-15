# CLAUDE.md — Himverse.AI

@AGENTS.md

Himverse.AI is an AI-assisted Himalayan tourism platform. Travellers discover curated listings from
verified local partners, generate and refine itineraries grounded in **our own tourism database**, and
send booking requests that partners confirm. Launch region: Arunachal Pradesh.

**Scope is defined by [MVP_SCOPE](docs/product/MVP_SCOPE.md)** — it wins over every other doc. Check it before
building; anything not listed there needs the owner's approval. Status and next phases: [ROADMAP](docs/product/ROADMAP.md).

## Current state (2026-10-15)

- **Built:** discovery, AI itineraries (with stays and transport), booking requests (any date, whole
  trip, partner switch), listing types (experience, guide, stay, transport — ADR-0008), one role per
  account (ADR-0007), password reset/change, TOTP for admins and partners, partner portal `/provider`,
  admin console `/admin`, account deletion and in-app booking alerts (ADR-0009), privacy/terms pages,
  automated a11y checks. Production is live on Vercel + Supabase with sample content; no staging yet.
- **Remaining for launch:** [RELEASE_CHECKLIST](docs/operations/RELEASE_CHECKLIST.md) — Sentry, email
  notifications (needs a domain), CAPTCHA, staging, legal review, sample content removal.
- **Not in MVP:** online payments (ADR-0005 proposed only), reviews, notifications, other regions.

## Roles and terms

Three account types — **traveller, partner, admin** — one per account. "Partner" in UI = `provider` in
code (`providers`, `provider_members`). Admins come from `user_roles`. Admin and partner accounts must
never book. Authorization is enforced by RLS ([ADR-0002](docs/decisions/ADR-0002-AUTHORIZATION-MODEL.md),
[AUTHORIZATION_AND_RLS](docs/security/AUTHORIZATION_AND_RLS.md)).

## Stack (verify versions in `package.json`)

Next.js 16 App Router (Cache Components on, `proxy.ts` not middleware) · React 19 · TypeScript strict ·
Tailwind CSS 4 · Supabase (Auth, Postgres, RLS, `pg_cron`) · Zod 4 · AI SDK 7 with Ollama (Cloud in
production) or Vercel AI Gateway, switched by `AI_PROVIDER` ([ADR-0006](docs/decisions/ADR-0006-SWITCHABLE-AI-PROVIDER-OLLAMA.md)) ·
Vitest · Playwright · npm · Vercel.
Next.js 16 differs from older versions: read `node_modules/next/dist/docs/` before using an API.

## Architecture in one screen

Modular monolith ([ADR-0001](docs/decisions/ADR-0001-MODULAR-MONOLITH.md)). Dependencies point downward only:

```
src/app/            routes — (site) traveller, (auth), provider/ portal, admin/ console, auth/ + api/ handlers
src/features/<x>/   feature UI, server actions, input schemas
src/server/         server-only domain services + data access ("server-only")
src/lib/            cross-cutting infra: env, supabase clients, errors, shared option constants
src/components/     shared, feature-agnostic UI
supabase/           migrations/ and tests/ (pgTAP RLS tests)
tests/              unit/, integration/, e2e/, smoke/ (deployed env, read-only)
```

Client code never imports `src/server/**`. Details: [PROJECT_STRUCTURE](docs/architecture/PROJECT_STRUCTURE.md).

## Non-negotiable rules

1. **Secrets:** `SUPABASE_SECRET_KEY`, `OLLAMA_API_KEY` and any credential live only in server code
   (`src/lib/env.server.ts`, `src/server/**`). Never prefix secrets with `NEXT_PUBLIC_`. Never read or print
   `.env*` files other than `.env.example`.
2. **Validate at boundaries** with Zod: form data, route params, search params, webhook bodies, env, and AI output.
3. **RLS on every table**, enabled in the same migration that creates it. Schema changes only via
   `supabase/migrations/`; migrations must stay compatible with the deployed code (expand → contract).
4. **AI output is untrusted.** Validate it, reference catalogue items only by IDs that exist in our DB, store it apart
   from curated data, and never present it as availability, price or booking confirmation.
5. **Bookings:** confirm only from authoritative partner (later payment) state; every mutating booking operation is
   idempotent. Rules live in [BOOKING_POLICY](docs/product/BOOKING_POLICY.md).
6. **No `any`** without an inline justification comment. No disabled tests, skipped checks, or weakened RLS to get green.
7. **Minimal dependencies and infrastructure.** New services, libraries or patterns of significance need an ADR.
8. UI handles loading, empty, success and error states explicitly.
9. **Production is owner-operated.** Never push migrations, change remote env or deploy; prepare the change and
   the exact commands, and ask the owner to run them.

Scoped detail lives in `.claude/rules/` (auto-applied by path) and [CODING_STANDARDS](docs/engineering/CODING_STANDARDS.md).

## Commands

```bash
npm run dev            # local dev server
npm run verify         # format:check + lint + typecheck + unit tests + build  (run before finishing)
npm run test:e2e       # Playwright against a production build on :3100 (run `npm run build` first)
npm run db:test        # pgTAP RLS tests (needs Docker + `npx supabase start`)
npm run db:types       # regenerate src/types/database.ts after any migration
npm run ai:ollama      # build the local himverse-planner model (then AI_PROVIDER=ollama)
```

Never claim a check passed unless you ran it in this session and saw it pass.

## Workflow for every change

Follow [DEVELOPMENT_WORKFLOW](docs/engineering/DEVELOPMENT_WORKFLOW.md): inspect → acceptance criteria (checked
against MVP_SCOPE) → affected modules/tables/security boundaries → plan + risks → smallest complete change →
tests → verify → review → update docs/ADRs → **task report** in `reports/tasks/YYYY-MM-DD-<slug>.md` from
[TASK_REPORT_TEMPLATE](docs/engineering/TASK_REPORT_TEMPLATE.md).

Skills: `/implement-feature`, `/db-migration-rls`, `/verify`, `/production-review`. Agent: `security-reviewer`.

## Documentation map (read the one you need, not all)

| Working on…           | Read                                                                                                                                                                                                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope, product        | [MVP_SCOPE](docs/product/MVP_SCOPE.md) · [PRD](docs/product/PRD.md) · [USER_FLOWS](docs/product/USER_FLOWS.md) · [ROADMAP](docs/product/ROADMAP.md)                                                                                                                                 |
| Bookings              | [BOOKING_POLICY](docs/product/BOOKING_POLICY.md) · [ADR-0004](docs/decisions/ADR-0004-BOOKING-LIFECYCLE.md)                                                                                                                                                                         |
| Auth, roles, RLS      | [AUTHORIZATION_AND_RLS](docs/security/AUTHORIZATION_AND_RLS.md) · [SECURITY](docs/security/SECURITY.md) · [ADR-0002](docs/decisions/ADR-0002-AUTHORIZATION-MODEL.md)                                                                                                                |
| Database, data access | [DATABASE_DESIGN](docs/database/DATABASE_DESIGN.md) · [DATA_ACCESS_PATTERNS](docs/database/DATA_ACCESS_PATTERNS.md)                                                                                                                                                                 |
| Actions, APIs         | [API_CONTRACTS](docs/api/API_CONTRACTS.md) · [VALIDATION](docs/api/VALIDATION.md) · [ERROR_HANDLING](docs/engineering/ERROR_HANDLING.md)                                                                                                                                            |
| AI itineraries        | [AI_ARCHITECTURE](docs/ai/AI_ARCHITECTURE.md) · [ITINERARY_GENERATION](docs/ai/ITINERARY_GENERATION.md) · [AI_EVALUATION](docs/ai/AI_EVALUATION.md)                                                                                                                                 |
| Architecture          | [ARCHITECTURE](docs/architecture/ARCHITECTURE.md) · [SYSTEM_DESIGN](docs/architecture/SYSTEM_DESIGN.md) · [TECH_STACK](docs/architecture/TECH_STACK.md)                                                                                                                             |
| Tests, logging        | [TESTING_STRATEGY](docs/engineering/TESTING_STRATEGY.md) · [OBSERVABILITY](docs/engineering/OBSERVABILITY.md)                                                                                                                                                                       |
| Env, deploy, ops      | [ENVIRONMENTS](docs/operations/ENVIRONMENTS.md) · [DEPLOYMENT](docs/operations/DEPLOYMENT.md) · [RELEASE_CHECKLIST](docs/operations/RELEASE_CHECKLIST.md) · [INCIDENT_RESPONSE](docs/operations/INCIDENT_RESPONSE.md) · [BACKUP_AND_RESTORE](docs/operations/BACKUP_AND_RESTORE.md) |
| Decisions             | [docs/decisions](docs/decisions/README.md)                                                                                                                                                                                                                                          |
