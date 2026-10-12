# Data Access Patterns

## Which Supabase client

| Context                                                            | Client                                                         | RLS            |
| ------------------------------------------------------------------ | -------------------------------------------------------------- | -------------- |
| Server Component / Server Action / Route Handler acting for a user | `createSupabaseServerClient()` (`src/lib/supabase/server.ts`)  | Applies        |
| Public page that must show only public rows (e.g. `/explore`)      | `createSupabasePublicClient()` (`src/lib/supabase/public.ts`)  | Applies (anon) |
| Client Component (realtime, auth UI only)                          | `createSupabaseBrowserClient()` (`src/lib/supabase/client.ts`) | Applies        |
| System/admin job with documented justification                     | Secret-key client (does not exist; not needed by Phase 1)      | **Bypassed**   |

Default to the user-context server client. Client Components should rarely query the DB directly —
prefer Server Components and Server Actions so validation and authorization stay on the server.

## Where queries live

Queries live in `src/server/<domain>/` modules marked `import "server-only"`. Features and routes call
these functions; they don't build queries inline. This keeps authorization checks and column
selection in one place.

```ts
// src/server/catalog/experiences.ts (illustrative)
import "server-only";
export async function listPublishedExperiences(filters: ExperienceFilters) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("experiences")
    .select("id, title, duration_minutes, price_from_minor, destination:destinations(id, name)")
    .eq("published", true);
  if (error) throw new AppError("INTERNAL", "Could not load experiences.", { cause: error });
  return data;
}
```

## Rules

- Select explicit columns; never `select("*")` into responses (avoids leaking new sensitive columns).
- Always check `error`; convert to `AppError` with the original as `cause`.
- RLS is the guarantee; application checks give better errors. Do both for writes.
- Multi-step writes that must be atomic go in a Postgres function (`rpc`) — the JS client has no transactions.
- Pagination: keyset (cursor) for lists that can grow; cap page size.

## Idempotency (bookings, payments)

1. Client generates an idempotency key (UUID) per user intent and resubmits it on retry.
2. Insert with a unique constraint on `(traveler_id, idempotency_key)`.
3. On unique violation, fetch and return the existing record instead of erroring.
4. External calls (payments) pass the same key to the provider when supported.

## Caching

Public catalogue reads may use `'use cache'` + `cacheTag`; anything user-specific must not be cached in
shared caches. Never cache results of the secret-key client.
