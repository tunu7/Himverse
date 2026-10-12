# Architecture Overview

Himverse.AI is a **modular monolith**: one Next.js application deployed on Vercel, backed by one
Supabase project (Postgres, Auth). Decision record: [ADR-0001](../decisions/ADR-0001-MODULAR-MONOLITH.md).

## Layers and dependency rule

```
┌──────────────────────────────────────────────────────────────┐
│ src/app            Routes, layouts, route handlers (thin)    │
├──────────────────────────────────────────────────────────────┤
│ src/features/<f>   Feature UI, server actions, input schemas │
├──────────────────────────────────────────────────────────────┤
│ src/server         Domain services, data access, AI orchest. │  "server-only"
├──────────────────────────────────────────────────────────────┤
│ src/lib            env, supabase clients, errors, utilities  │
└──────────────────────────────────────────────────────────────┘
          │ Supabase (Postgres + RLS, Auth)   │ AI provider (TBD)
```

- Imports point **downward only**. `src/server` never imports from `src/app` or `src/features`.
- Features do not import each other's internals; shared logic moves down to `src/server` or `src/lib`.
- `src/components` holds feature-agnostic UI and may be used by `app` and `features`.

## Module boundaries (planned)

| Module (feature + server) | Owns                                                       |
| ------------------------- | ---------------------------------------------------------- |
| `catalog`                 | Destinations, experiences, provider public profiles        |
| `providers`               | Provider onboarding, verification state, availability      |
| `itineraries`             | Trip parameters, AI generation, versions, grounding checks |
| `bookings`                | Booking requests, lifecycle, idempotency                   |
| `accounts`                | Profiles and roles on top of Supabase Auth                 |
| `admin`                   | Curation and verification tools, audit log                 |

None exist yet; they are created when their phase starts ([ROADMAP](../product/ROADMAP.md)).

## Trust boundaries

1. **Browser ↔ server:** everything from the client is untrusted and validated with Zod.
2. **Server ↔ database:** user-context Supabase client so RLS enforces access; the RLS-bypassing secret
   key is reserved for documented admin/system paths.
3. **Server ↔ AI provider:** AI output is untrusted data; validated and grounded before use
   ([AI_ARCHITECTURE](../ai/AI_ARCHITECTURE.md)).
4. **Server ↔ payment/provider systems (future):** webhooks verified by signature; state changes idempotent.

## Rendering model

Next.js 16 with **Cache Components** enabled (`next.config.ts`). Static/cached content prerenders into
the static shell; request-dependent UI (session, personalised data) renders behind `<Suspense>`.
Mutations use Server Actions; Route Handlers are used for webhooks and machine clients.
See [SYSTEM_DESIGN](SYSTEM_DESIGN.md).

## When to split out a service

Only via ADR when there is a concrete requirement, e.g. a Python-only ML dependency, workloads exceeding
Vercel Function limits, or independent scaling needs that are measured, not assumed.
