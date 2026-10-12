# System Design

Describes how requests flow through the system. Components marked _(planned)_ do not exist yet.

## Request paths

### Read (catalogue page)

`Browser → Vercel CDN (static shell) → Server Component (inside <Suspense>) → src/server/catalog →
anonymous Supabase client → RLS`

`/explore` reads at request time (`await connection()`) through the cookie-less client in
`src/lib/supabase/public.ts`, so visibility is decided only by the public RLS policies and builds need no
database. Caching public catalogue data (`'use cache'` + tags, invalidated when providers or admins
publish) is a later optimisation.

### Mutation (e.g. request booking)

`Form (useActionState) → Server Action (src/features/<f>/actions.ts) → parseInput (Zod) →
src/server/<domain> (requireUser/requireAdmin) → Supabase (RLS or a security-definer RPC) →
ActionResult → refresh()`

Implemented in Phase 1 for auth, profile, provider applications and experiences, and admin review.
Bookings (Phase 3) add a unique idempotency key on top of the same path.

### AI generation

`Server Action → itineraries service → retrieve candidate items (DB) → AI provider → Zod validate →
grounding check → persist itinerary version → return` — see [ITINERARY_GENERATION](../ai/ITINERARY_GENERATION.md).

### Webhooks (planned)

`Provider/payment → Route Handler (src/app/api/webhooks/...) → verify signature → idempotent apply`

## Authentication and sessions

Supabase Auth with cookie sessions via `@supabase/ssr`:

- `src/lib/supabase/server.ts` — user-context client for Server Components/Actions/Route Handlers. It
  awaits `cookies()` and then `io()` before creating the client, so prerendering never touches env vars
  or supabase-js's `Date.now()` session logic.
- `src/lib/supabase/public.ts` — anonymous, cookie-less server client for public pages.
- `src/lib/supabase/client.ts` — browser client (publishable key). Not used yet.
- `src/proxy.ts` — refreshes the session cookie (`getClaims()`) on every non-asset request and redirects
  signed-out visitors away from `/account`, `/provider`, `/admin`. Optimistic only.
- `src/server/auth/session.ts` — `getCurrentUser()` (verified claims), `isCurrentUserAdmin()` (live
  `user_roles` lookup, fails closed), `requireUser()`, `requireAdmin()`, `requireUserForPage()`. Real
  authorization happens here and in RLS ([ADR-0002](../decisions/ADR-0002-AUTHORIZATION-MODEL.md)).
- Sign-up/sign-in use email + password through Server Actions; `/auth/confirm` verifies email
  confirmation links (token-hash flow). `next` redirects go through `safeRedirectPath()`.

Session reads are request-time data: components reading them render behind `<Suspense>`.
Non-admins requesting `/admin/*` get a 404, so the admin area isn't revealed.

## Data consistency

- Booking state transitions are enforced in the database (constraints and/or functions), not only in UI.
- Idempotency: mutating booking/payment operations accept an idempotency key stored with a unique
  constraint; a repeat returns the original result ([DATA_ACCESS_PATTERNS](../database/DATA_ACCESS_PATTERNS.md)).

## Long-running work

Itinerary generation may take several seconds. MVP approach: Server Action with streamed progress
UI. If latency or reliability requires it, move to a durable background job — decision via ADR.

## Failure handling

See [ERROR_HANDLING](../engineering/ERROR_HANDLING.md) and [OBSERVABILITY](../engineering/OBSERVABILITY.md).
