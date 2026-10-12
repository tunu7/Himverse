# System Design

Describes how requests flow through the system. Components marked _(planned)_ do not exist yet.

## Request paths

### Read (catalogue page)

`Browser → Vercel CDN (static shell) → Server Component → src/server/catalog (planned) → Supabase (RLS)`

Public catalogue data is cacheable (`'use cache'` with tags); invalidated via `updateTag`/`revalidateTag`
when admins publish changes.

### Mutation (e.g. request booking)

`Form → Server Action (src/features/bookings/actions.ts, planned) → Zod parse → auth check →
src/server/bookings service → Supabase (RLS, unique idempotency key) → ActionResult`

### AI generation

`Server Action → itineraries service → retrieve candidate items (DB) → AI provider → Zod validate →
grounding check → persist itinerary version → return` — see [ITINERARY_GENERATION](../ai/ITINERARY_GENERATION.md).

### Webhooks (planned)

`Provider/payment → Route Handler (src/app/api/webhooks/...) → verify signature → idempotent apply`

## Authentication and sessions

Supabase Auth with cookie sessions via `@supabase/ssr`:

- `src/lib/supabase/server.ts` — user-context client for Server Components/Actions/Route Handlers.
- `src/lib/supabase/client.ts` — browser client (publishable key).
- `src/proxy.ts` _(planned, Phase 1)_ — refreshes the session cookie; optimistic redirects only. Real
  authorization happens in server code and RLS, never only in the proxy.

Session reads are request-time data: components reading them render behind `<Suspense>`.

## Data consistency

- Booking state transitions are enforced in the database (constraints and/or functions), not only in UI.
- Idempotency: mutating booking/payment operations accept an idempotency key stored with a unique
  constraint; a repeat returns the original result ([DATA_ACCESS_PATTERNS](../database/DATA_ACCESS_PATTERNS.md)).

## Long-running work

Itinerary generation may take several seconds. MVP approach: Server Action with streamed progress
UI. If latency or reliability requires it, move to a durable background job — decision via ADR.

## Failure handling

See [ERROR_HANDLING](../engineering/ERROR_HANDLING.md) and [OBSERVABILITY](../engineering/OBSERVABILITY.md).
