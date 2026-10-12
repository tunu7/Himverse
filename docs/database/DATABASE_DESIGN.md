# Database Design

Status: **no schema exists yet.** The entities below are a _proposed_ starting model for discussion.
Each is created by a migration in the phase that needs it, with RLS and tests. Nothing here is a
committed requirement until migrated.

## Conventions

- Postgres 17 (Supabase). All schema changes via `supabase/migrations/` — never via the dashboard in
  shared environments. Create files with `npx supabase migration new <snake_case_name>`.
- Tables `snake_case`, plural; primary keys `id uuid default gen_random_uuid()`.
- `created_at timestamptz not null default now()`, `updated_at` maintained by trigger where mutable.
- Money as `integer` minor units (paise) + `currency text` (`'INR'` default); never floats.
- Status columns use Postgres enums or `check` constraints; transitions enforced in DB where critical.
- Foreign keys always indexed. Soft-delete only where there is a stated need.
- **RLS enabled in the same migration that creates the table** ([AUTHORIZATION_AND_RLS](../security/AUTHORIZATION_AND_RLS.md)).
- Generated types: `npx supabase gen types typescript --local > src/types/database.ts`.

## Proposed entities

| Table (proposed)     | Purpose                                                        | Phase |
| -------------------- | -------------------------------------------------------------- | ----- |
| `profiles`           | 1:1 with `auth.users`; display name, role                      | 1     |
| `providers`          | Provider organisation; `verification_status`                   | 1     |
| `provider_members`   | Users who can act for a provider                               | 1     |
| `destinations`       | Curated places/areas (district, coordinates, seasonality)      | 1     |
| `experiences`        | Bookable/visitable offerings; provider, destination, published | 1     |
| `itinerary_requests` | Traveler's trip parameters                                     | 2     |
| `itineraries`        | Versioned AI-generated plans (JSON validated, references IDs)  | 2     |
| `availability_slots` | Authoritative availability per experience/date                 | 3     |
| `bookings`           | Booking requests and lifecycle; idempotency key (unique)       | 3     |
| `audit_log`          | Admin and sensitive actions                                    | 1     |

### Separation of trusted and AI-generated data

Curated tables (`destinations`, `experiences`, `providers`, `availability_slots`) are written only by
admins/providers through validated paths. AI output lives in `itineraries` (with `model`, `prompt_version`,
`validation_status`) and references curated rows by ID; it never writes to curated tables.

### Booking lifecycle (proposed)

`requested → confirmed | declined | expired`; `confirmed → cancelled`. A booking is `confirmed` only by
provider action (or verified payment webhook if payments are adopted). `(traveler_id, idempotency_key)`
is unique.

## Open questions

Role model: single `role` column vs role table (multi-role users such as a provider who also travels);
availability granularity (date vs time slot vs capacity); geo data (PostGIS needed?); content
localisation; media storage (Supabase Storage buckets and their policies).
