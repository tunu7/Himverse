---
paths:
  - "supabase/**"
  - "src/server/**"
  - "src/lib/supabase/**"
  - "src/types/database.ts"
---

# Supabase, data access and migrations

Docs: docs/database/DATABASE_DESIGN.md, docs/database/DATA_ACCESS_PATTERNS.md,
docs/security/SECURITY.md. Use the `/db-migration-rls` skill for schema work.

- Schema changes only through new files from `npx supabase migration new <name>`. Never edit a migration
  that has been applied to a shared environment; write a forward migration.
- Every new table: `enable row level security` in the same migration, per-operation policies,
  `using` + `with check` on updates, indexes on policy and FK columns.
- Use `(select auth.uid())` in policies. Never reference `user_metadata` in policies.
- `security definer` functions: `set search_path = ''`, fully qualified names, non-exposed schema.
- Every table change ships with pgTAP tests in `supabase/tests/` covering allowed and denied access per role.
- Queries live in `src/server/<domain>/` with `import "server-only"`. Select explicit columns, check
  `error`, wrap in `AppError` with `cause`.
- Default to `createSupabaseServerClient()` (RLS applies). An RLS-bypassing secret-key client is only for
  documented admin/system paths and must be justified in the task report.
- Money is integer minor units + currency. Atomic multi-step writes go in a Postgres function.
- Do not invent schema beyond the current task's acceptance criteria.
- Never run `supabase db push` or anything against a linked remote project without explicit user approval.
