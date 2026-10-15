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
- Generated types: `npm run db:types` (`supabase gen types typescript --local`).
- Searchable tables have a generated `search_vector tsvector` (English config) with a GIN index
  (migration `20261012142919_discovery_search`). Any new column an API role must filter on needs an
  explicit column grant and a `privileges.test.sql` snapshot update.

## Entities

Phase 1 tables are **implemented** (migrations `20261012131029_identity_and_roles`,
`20261012131030_providers`, `20261012131031_catalog`); the rest are still proposed. Access rules:
[AUTHORIZATION_AND_RLS](../security/AUTHORIZATION_AND_RLS.md). Local sample data: `supabase/seed.sql`
(local only, no users or admins).

| Table                      | Purpose                                                                                                                                                                                                                                                                                                  | Phase |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `profiles`                 | 1:1 with `auth.users`; display name, account type, `bookings_seen_at` (ADR-0009)                                                                                                                                                                                                                         | 1 ✅  |
| `user_roles`               | Elevated roles (`admin`); no app write path                                                                                                                                                                                                                                                              | 1 ✅  |
| `providers`                | Public provider profile; `status` lifecycle                                                                                                                                                                                                                                                              | 1 ✅  |
| `provider_private_details` | Legal name, contact details; members and admins only                                                                                                                                                                                                                                                     | 1 ✅  |
| `provider_members`         | Users who can act for a provider                                                                                                                                                                                                                                                                         | 1 ✅  |
| `provider_status_events`   | Audit trail of provider status changes                                                                                                                                                                                                                                                                   | 1 ✅  |
| `destinations`             | Admin-curated places (district, summary); coordinates/seasonality later                                                                                                                                                                                                                                  | 1 ✅  |
| `experiences`              | Provider offerings; draft/published/archived; price in paise; `accepts_bookings` partner switch                                                                                                                                                                                                          | 1 ✅  |
| `itineraries`              | Owner-private trip; current version pointer (composite FK, same itinerary)                                                                                                                                                                                                                               | 3 ✅  |
| `itinerary_versions`       | Immutable validated generations: preferences, plan (`itinerary.v2`), DB-computed total                                                                                                                                                                                                                   | 3 ✅  |
| `itinerary_items`          | Immutable plan items (`item_kind` activity/stay/transport, `units`) with DB snapshots                                                                                                                                                                                                                    | 3 ✅  |
| `itinerary_generations`    | Generation log for rate limits and observability (no prompt text)                                                                                                                                                                                                                                        | 3 ✅  |
| `availability_slots`       | Provider-managed dates with capacity; `seats_confirmed <= capacity` constraint                                                                                                                                                                                                                           | 4 ✅  |
| `bookings`                 | Requests and lifecycle; idempotency key (unique per traveller); one active booking per slot, or per experience and date when there's no slot (`slot_id` is optional); price and date snapshots; `traveler_id` is nulled and personal details cleared when the traveller deletes their account (ADR-0009) | 4 ✅  |
| `booking_events`           | Append-only booking history                                                                                                                                                                                                                                                                              | 4 ✅  |
| `audit_log`                | General admin/sensitive actions (provider status uses `provider_status_events`)                                                                                                                                                                                                                          | later |

### Separation of trusted and AI-generated data

Curated tables (`destinations`, `experiences`, `providers`, `availability_slots`) are written only by
admins/providers through validated paths. AI output lives in `itinerary_versions` and `itinerary_items` (with `model`, `prompt_version`,
`validation_status`) and references curated rows by ID; it never writes to curated tables.

### Booking lifecycle (implemented: see ADR-0004)

`requested → confirmed | declined | expired`; `confirmed → cancelled`. A booking is `confirmed` only by
provider action (or verified payment webhook if payments are adopted). `(traveler_id, idempotency_key)`
is unique.

## Open questions

The role and provider-authority model is decided in
[ADR-0002](../decisions/ADR-0002-AUTHORIZATION-MODEL.md). Still open: availability granularity (date vs time slot vs capacity); geo data (PostGIS needed?); content
localisation; media storage (Supabase Storage buckets and their policies).
