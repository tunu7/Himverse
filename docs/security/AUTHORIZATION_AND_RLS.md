# Authorization and Row Level Security

## Roles (proposed)

| Role      | Can                                                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------------------------------- |
| anonymous | Read published catalogue data from verified providers                                                                     |
| traveler  | Above + own profile, own itinerary requests/itineraries, own bookings                                                     |
| provider  | Traveler abilities + manage own provider profile, experiences, availability; read/respond to bookings for own experiences |
| admin     | Verify providers, publish/unpublish catalogue, read for support; all actions audit-logged                                 |

How roles are stored (column on `profiles` vs membership tables vs JWT custom claims) is an open question
to settle by ADR in Phase 1. Provider authority comes from `provider_members`, not from a global role alone.

## RLS rules

1. `alter table ... enable row level security;` in the same migration as `create table`. No exceptions.
2. Separate policies per operation (`select`, `insert`, `update`, `delete`) and per role (`to authenticated`,
   `to anon`). No `for all` policies on sensitive tables.
3. `update` policies have both `using` and `with check` so users can't move rows to another owner.
4. Use `(select auth.uid())` (wrapped in `select` so Postgres caches it per statement), and index columns
   used in policies.
5. Helper functions used in policies are `security definer` only when necessary, with `set search_path = ''`
   and fully qualified names; they live in a non-exposed schema (e.g. `private`).
6. Never trust `user_metadata` in policies (user-editable). `app_metadata` or tables are acceptable.
7. Views exposed to clients use `security_invoker = true`.
8. Booking status changes to `confirmed` are restricted to the provider path (and/or a verified
   payment webhook) — travelers can never set it.

## Example policy shape

```sql
create table public.itinerary_requests (
  id uuid primary key default gen_random_uuid(),
  traveler_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.itinerary_requests enable row level security;
create index on public.itinerary_requests (traveler_id);

create policy "travelers read own requests" on public.itinerary_requests
  for select to authenticated using ((select auth.uid()) = traveler_id);
create policy "travelers create own requests" on public.itinerary_requests
  for insert to authenticated with check ((select auth.uid()) = traveler_id);
```

_(Illustrative only — not a migration.)_

## Testing

Every table has pgTAP tests in `supabase/tests/` that impersonate each role (`set local role`, JWT claims)
and assert both allowed and denied operations. Run with `npm run db:test`.

## Secret key (RLS bypass)

Allowed only in `src/server/**` for operations that cannot run as a user (e.g. expiring stale booking
requests, webhook processing) and only when documented in the PR and covered by tests. Never in Client
Components, never in `NEXT_PUBLIC_` variables, never logged.
