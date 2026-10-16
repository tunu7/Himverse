---
name: db-migration-rls
description: Create or review a Supabase Postgres migration with Row Level Security policies and pgTAP tests for Himverse.AI. Use for any table, column, policy, function, trigger, or index change, or to audit existing RLS.
---

# Database migration with RLS

References: docs/database/DATABASE_DESIGN.md, docs/security/SECURITY.md,
docs/database/DATA_ACCESS_PATTERNS.md.

## Create

1. Confirm the change is required by the current acceptance criteria. Don't add speculative tables/columns.
2. `npx supabase migration new <snake_case_description>` — never hand-name or edit applied migrations.
3. In the migration:
   - Tables: `snake_case` plural, `uuid` PK, `created_at`, FKs with explicit `on delete`, indexes on FKs.
   - `alter table ... enable row level security;` in the same file.
   - One policy per operation and role; `to authenticated` / `to anon` explicit; `using` + `with check` on
     update; `(select auth.uid())`; no `user_metadata`.
   - Money in integer minor units; status via enum/check; critical transitions enforced in DB.
   - `security definer` functions: `set search_path = ''`, qualified names, `private` schema, revoke
     execute from `public`/`anon` unless needed.
4. Tests in `supabase/tests/<table>.test.sql` (pgTAP): for each role (anon, traveler A, traveler B,
   provider member, other provider, admin) assert allowed **and** denied select/insert/update/delete.
5. Run locally (requires Docker): `npx supabase start`, `npx supabase db reset`, `npm run db:test`.
   If Docker isn't available, say so explicitly — do not report DB tests as passed.
6. Regenerate types: `npx supabase gen types typescript --local > src/types/database.ts`.
7. Update docs/database/DATABASE_DESIGN.md (move entity from proposed to implemented).

## Review checklist

- [ ] RLS enabled on every new table; no table reachable by `anon` unintentionally
- [ ] No `for all` policy on sensitive data; update policies have `with check`
- [ ] Policy columns indexed
- [ ] Booking `confirmed` status cannot be set by travelers
- [ ] Migration is backward compatible with deployed code (expand → migrate → contract)
- [ ] Destructive changes have a data/rollback plan
- [ ] pgTAP tests cover allowed and denied paths and were actually run

Never run `supabase db push` or touch a linked remote project without explicit user approval.
