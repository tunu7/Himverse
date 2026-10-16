# Backup and restore

Status: **procedure drilled locally only (2026-10-13).** Hosted backups are not configured yet because the
Supabase projects don't exist. Verifying them on staging is a release-checklist item.

## Strategy

1. **Primary: Supabase managed backups.** Production must be on a plan with daily backups, with
   Point-in-Time Recovery (PITR) enabled before taking real bookings. Restores are done from the Supabase
   dashboard. **Open question:** the recovery point objective (how much data loss is acceptable) and
   recovery time objective. PITR gives minutes; daily backups give up to 24 hours.
2. **Secondary: our own logical data dump**, kept outside Supabase (weekly, and before any risky
   migration). This protects against losing the Supabase account or project itself.
3. **Schema is never restored from a dump.** It comes from `supabase/migrations/`, so a restore is:
   new project → apply migrations → restore data.

## Logical dump (secondary backup)

```bash
# Data only, application tables + the auth tables they reference. Run against the target with a
# connection string from the Supabase dashboard (never commit it).
pg_dump "$DATABASE_URL" --data-only -Fc \
  --table='public.*' --table=auth.users --table=auth.identities \
  -f himverse-$(date +%Y%m%d).dump
pg_restore -l himverse-YYYYMMDD.dump | grep -c 'TABLE DATA'   # expect 17 today; verify every time
```

**Pitfall found in the drill:** combining `--schema=public` with any `--table` silently dumps only the
`--table` matches, because `pg_dump` ignores `--schema` once `--table` is given. The first attempt dumped
2 tables instead of 17. Always use `--table` patterns as above and check the table count.

Store dumps encrypted, with restricted access: they contain personal data (names, phones, emails).
Retention follows the DPDP review (open question).

## Restore

```bash
# 1. Fresh database with the schema from migrations (new project: supabase db push --linked)
# 2. Restore data; circular FKs (itineraries ↔ itinerary_versions) need triggers disabled
pg_restore -d "$DATABASE_URL" --data-only --no-owner --disable-triggers --exit-on-error himverse-YYYYMMDD.dump
# 3. Verify: row counts + checksum match the source; anon sees only public rows; cron job present
```

`--disable-triggers` needs superuser. Locally that's `supabase_admin`; **on hosted Supabase the
`postgres` role isn't a superuser**, so a hosted data-only restore may need the circular constraint
dropped and re-added in a reviewed migration. That's why managed backups/PITR are the primary path.
Rehearsing this on staging is a release-checklist item.

Restoring a full dump (schema included) into a database with a different name fails, because `pg_cron`
can only be created in the database named by `cron.database_name`. That's another reason the schema comes
from migrations.

## Local drill record (2026-10-13)

| Step | Result |
| --- | --- |
| Seeded database + one extra auth user; counts + checksum | destinations 8, providers 4, experiences 22, slots 4, users 1 |
| Data dump with `--table` patterns | 17 tables |
| Simulated loss: `supabase db reset --no-seed` | experiences 0 |
| Restore as `supabase_admin` with `--disable-triggers` | exit 0 |
| Compare counts + experience checksum | **identical** |
| RLS after restore (anon) | 17 public experiences (unchanged) |
| `himverse-booking-sweep` cron job | present (from migrations) |
| Loss → restored | 29 s locally |
