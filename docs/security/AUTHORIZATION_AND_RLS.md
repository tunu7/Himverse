# Authorization and Row Level Security

## Roles

Decided in [ADR-0002](../decisions/ADR-0002-AUTHORIZATION-MODEL.md) and implemented in the Phase 1
migrations under `supabase/migrations/`; behaviour is pinned by `supabase/tests/*.test.sql`.

| Actor           | Where authority comes from                                                  | Can                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| anonymous       | Nothing                                                                     | Read verified providers, published destinations, and experiences that are published **and** from a verified provider **and** at a published destination                                                                                                                                                                                                                                               |
| traveler        | Being authenticated (implicit, no row)                                      | Above, plus their own profile (read; update `display_name` only) and their own role rows (read)                                                                                                                                                                                                                                                                                                       |
| provider member | `provider_members` row, combined with the provider's `status`               | Edit the public profile (not while `pending_review` or `suspended`) and private details (only in `draft`/`rejected`, so reviewed identity can't change). Manage experiences (at most 200 per provider); publish only while `verified` and never an experience an admin locked. Add dates only while `verified`, from today to two years ahead. Submit the application                                 |
| admin           | `user_roles` row with `role = 'admin'`                                      | Read all; review providers through `review_provider`; manage destinations; unpublish/archive any experience, which sets a per-experience moderation lock only an admin can clear (SQL only for now)                                                                                                                                                                                                   |
| itinerary owner | `itineraries.owner_id = auth.uid()`                                         | Read, rename, change current version and delete **only their own** itineraries. Versions and items are immutable and written only by `save_itinerary_version`, which requires the caller's own pending generation reservation and re-checks ownership and that every experience is public ([ADR-0003](../decisions/ADR-0003-AI-ITINERARY-GENERATION.md)). No sharing.                                 |
| booking parties | `bookings.traveler_id = auth.uid()` or membership of `bookings.provider_id` | Travellers read their own bookings; provider members read their provider's (with the booking phone). Both read the booking's history, but not who acted (`booking_events.actor_id` isn't selectable). All writes go through `request_booking`, `respond_to_booking` and `cancel_booking`; nobody can set status, price or provider directly ([ADR-0004](../decisions/ADR-0004-BOOKING-LIFECYCLE.md)). |

Roles are **never** read from `user_metadata`, `profiles`, or anything else the client supplies. Policies
look them up live, so a change applies on the caller's next query.

## Admin console (`/admin`)

Server-rendered pages for admins only (`requireAdminForPage`: signed-out → sign-in, non-admin → plain
404, and the admin tabs and header link render only for admins). Every read and write goes through
`src/server/admin/admin.ts` (`requireAdmin()` + the signed-in user's client), so the RLS policies
above stay the authority:

| Page                  | What admins can do                                                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `/admin`              | Overview: providers awaiting review, requests awaiting a reply, AI plans today vs the cap, catalogue and booking counts |
| `/admin/providers`    | Filter by status, verify / request changes / suspend (`review_provider`), status history with reviewer notes            |
| `/admin/destinations` | Create, edit, publish/hide; delete only when no experiences use it (FK `restrict`)                                      |
| `/admin/experiences`  | Filter and search; unpublish or archive (sets the moderation lock) or publish (clears it)                               |
| `/admin/bookings`     | Read-only list across providers; **no traveller contact details** (only the booking's provider sees those)              |

Granting or revoking admin is still **not** in the app (runbook below).

## Admin bootstrap runbook

There is **no application path that grants admin**: no RPC, Server Action, route or UI, and `anon` and
`authenticated` have no write privilege on `user_roles`. Admins are created only by the database owner
running SQL directly. The Supabase secret key is not involved.

**Prerequisite:** email confirmations must be **on** in that environment (Supabase dashboard → Auth).
Otherwise anyone who registers an address first owns it, and identifying the admin by email proves nothing.

**One-time creation of the first admin (per environment):**

1. The future admin signs up through the normal app flow, confirms their email, **signs in**, and copies
   the **Account ID** shown on `/account`. They send it to the project owner over a trusted channel
   (in person, or an already-verified team chat), not over email alone.
2. A project owner opens the target project's **SQL Editor** in the Supabase dashboard, or runs `psql`
   against the local stack. Both connect as the `postgres` owner role. Do not use `npx supabase status`
   in an agent session; it prints local keys.
3. Check the account first. It must be the expected email, confirmed, and recently signed in:

   ```sql
   select id, email, email_confirmed_at, last_sign_in_at, created_at
   from auth.users
   where id = '00000000-0000-0000-0000-000000000000';  -- the Account ID from step 1
   ```

   Stop if the email doesn't match, `email_confirmed_at` is null, or `last_sign_in_at` is missing or old.

4. Grant by **user id**, never by email. The `where not exists` guard creates an admin only if none exists
   yet, so running it twice does nothing:

   ```sql
   insert into public.user_roles (user_id, role, granted_by)
   select u.id, 'admin', null
   from auth.users u
   where u.id = '00000000-0000-0000-0000-000000000000'  -- the Account ID from step 1
     and u.email_confirmed_at is not null
     and not exists (select 1 from public.user_roles where role = 'admin')
   returning user_id, role, granted_at;
   ```

5. Check that exactly one row was returned. If none came back, either an admin already exists or the
   account isn't confirmed: investigate, don't force it.
6. Ask the new admin to sign out and back in, then open `/admin` (the admin console). Record who ran the grant,
   when, and for which Account ID in the team's operations log (not in the repo).

**Later admins and revocation** use the same direct-SQL path, run by a project owner, without the
`not exists` guard, always by verified user id with `granted_by` set to the granting admin's id:
`insert into public.user_roles (user_id, role, granted_by) values (...)` /
`delete from public.user_roles where user_id = ... and role = 'admin'`. Revocation applies on the user's
next request. An in-app admin-management feature would need its own ADR (admin-only `security definer`
function with an audit trail).

Never paste these statements into application code, migrations or seed files that run in shared
environments. Local `supabase/seed.sql` must not create admins either. Tests create their own users and
roles inside a rolled-back transaction.

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
