# Architecture

Himverse.AI is a **modular monolith**: one Next.js app on Vercel (`bom1`) and one Supabase project
(Postgres, Auth, `pg_cron`). Decision: [ADR-0001](../decisions/ADR-0001-MODULAR-MONOLITH.md). Folder
layout: [PROJECT_STRUCTURE](PROJECT_STRUCTURE.md).

## Layers and dependency rule

```
src/app            routes, layouts, route handlers (thin)
src/features/<f>   feature UI, server actions, input schemas
src/server         domain services, data access, AI orchestration   ("server-only")
src/lib            env, supabase clients, errors, shared constants
        │ Supabase (Postgres + RLS, Auth)  │ AI: Ollama / AI Gateway (ADR-0006)  │ Razorpay (ADR-0005)
```

- Imports point **downward only**. `src/server` never imports `src/app` or `src/features`.
- Features don't import each other's internals; shared logic moves down to `src/server` or `src/lib`.
- `src/components` holds feature-agnostic UI used by `app` and `features`.

## Modules

| Module (feature + server) | Owns |
| --- | --- |
| `discovery` / `catalog` | Destinations, listings, search, partner public profiles |
| `providers`, `portal` | Partner onboarding, verification, listings, partner portal |
| `itineraries` | Trip preferences, AI generation, versions, grounding |
| `bookings` | Requests, lifecycle, idempotency, whole-trip booking, alerts |
| `payments` | Deposits, Razorpay checkout/webhooks, refunds, partner payouts |
| `auth`, `account`, `profiles` | Sign-in/up, Google, two-step login, profiles, account deletion |
| `admin` | Console: verification, curation, moderation, bookings, payments |
| `legal` | Privacy and terms pages |

## Trust boundaries

1. **Browser ↔ server:** everything from the client is untrusted and validated with Zod.
2. **Server ↔ database:** the user-context Supabase client, so RLS applies. The secret key is used only
   by the payments system path (`src/server/payments/system-db.ts`, payment RPCs only).
3. **Server ↔ AI provider:** output is untrusted, validated and grounded before use
   ([AI_ARCHITECTURE](../ai/AI_ARCHITECTURE.md)).
4. **Razorpay ↔ server:** webhooks are accepted only with a valid HMAC over the raw body, deduplicated
   by event id; payment state changes only through service-role database functions
   ([PAYMENTS](../operations/PAYMENTS.md)).

## Request paths

- **Read (catalogue):** browser → Vercel static shell → Server Component inside `<Suspense>` →
  `src/server/catalog` → cookie-less anonymous client (`src/lib/supabase/public.ts`) → public RLS.
  Search params are parsed in `src/features/discovery/search-params.ts`
  ([DATA_ACCESS_PATTERNS](../database/DATA_ACCESS_PATTERNS.md)). Not-found detail pages call `notFound()`
  inside the streamed boundary, so they return 200 with `noindex` (a Cache Components trade-off).
- **Mutation:** form (`useActionState`) → Server Action (`src/features/<f>/actions.ts`) → `parseInput`
  (Zod) → `src/server/<domain>` (authenticate, authorise) → Supabase (RLS or a security-definer RPC) →
  `ActionResult` → `refresh()`. Bookings and payments add idempotency keys.
- **AI generation:** Server Action → retrieve candidates → model → Zod → grounding → save version
  ([ITINERARY_GENERATION](../ai/ITINERARY_GENERATION.md)).
- **Webhooks:** Razorpay → `src/app/api/webhooks/razorpay` → verify signature → log event →
  idempotent apply. **Scheduled:** pg_cron (booking sweep, unpaid deposits) and Vercel Cron
  (`/api/cron/payments`, daily).

## Rendering and sessions

- Next.js 16 with **Cache Components**: static content prerenders into the shell; request-time UI
  (session, personal data) renders behind `<Suspense>`. Mutations use Server Actions; Route Handlers
  serve webhooks, cron, health and auth callbacks.
- Supabase Auth with cookie sessions (`@supabase/ssr`): `src/lib/supabase/server.ts` (user context),
  `public.ts` (anonymous), `client.ts` (browser).
- `src/proxy.ts` refreshes the session and redirects signed-out visitors away from protected areas.
  It is optimistic only. Real authorisation is in `src/server/auth/session.ts` and RLS
  ([SECURITY](../security/SECURITY.md)). Non-admins get a 404 for `/admin/*`.

## Data consistency

Booking and payment transitions are enforced in database functions and triggers, not only in the UI.
Mutating booking and payment operations take an idempotency key with a unique constraint; a repeat
returns the original result.

## Tech stack

`package.json` is authoritative for versions.

| Concern | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 16 App Router, Cache Components | Server Components/Actions, Vercel-native |
| UI | React 19, Tailwind CSS 4 | Standard, minimal CSS tooling |
| Language | TypeScript 5, `strict` + `noUncheckedIndexedAccess` | Compile-time safety |
| Auth | Supabase Auth (`@supabase/ssr`), Google OAuth, TOTP MFA | Cookie sessions, integrates with RLS |
| Database | Supabase Postgres 17 + RLS, `pg_cron` | Policies and transitions enforced in the DB |
| Validation | Zod 4 | Runtime validation + inferred types |
| AI | AI SDK 7; Ollama (Cloud in prod) or AI Gateway | Switchable by env ([ADR-0006](../decisions/ADR-0006-SWITCHABLE-AI-PROVIDER-OLLAMA.md)) |
| Payments | Razorpay REST over `fetch` (no SDK) | Deposits ([ADR-0005](../decisions/ADR-0005-PAYMENTS-RAZORPAY.md)) |
| Tests | Vitest, Playwright, `@axe-core/playwright`, pgTAP | Unit, E2E, accessibility, RLS |
| Lint/format | ESLint 9 (`eslint-config-next`), Prettier 3 | Next.js rules, consistent code |
| Tooling | npm (lockfile), Node.js 22+, GitHub Actions | Default tooling and CI |
| Hosting | Vercel (`bom1`) | Previews per PR, Git integration |

**Not used:** separate services (Python/FastAPI), queues, Redis, ORMs (Supabase client + SQL
migrations), state-management or component libraries. Adding one needs an ADR.

**Undecided:** email provider (needs a domain), error-tracking vendor (Sentry pending,
[OBSERVABILITY](../engineering/OBSERVABILITY.md)), CAPTCHA.

## When to split out a service

Only via an ADR with a measured need: a Python-only dependency, work beyond Vercel Function limits, or
independent scaling.
