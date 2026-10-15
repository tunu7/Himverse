# Observability

Status: **logging, a health check and SQL signals exist; no error-tracking or alerting vendor is connected
yet.** Sentry (errors) is planned via the Vercel Marketplace (Phase 5, Workstream B). Until then, alerts below are checked manually or by an uptime monitor on `/api/health`.

## Logging (`src/lib/logger.ts`)

- `logger.info|warn|error(event, fields)` writes **one JSON line** with `level`, `event`, `time`, `env`
  and `release` (short commit SHA on Vercel). Vercel attaches the request ID to every log line, so no
  request-ID plumbing is needed in the app.
- Field names that look sensitive (`email`, `phone`, `token`, `secret`, `password`, `cookie`,
  `authorization`, `api key`, `prompt`) are replaced with `[redacted]` at any depth; long strings and
  deep objects are truncated. This is a backstop: **log IDs and codes, not personal data.**
- `console.*` is not used directly anywhere else in `src/`.
- Unexpected Server Action errors are logged by `toLoggedFailure` (name, code, status, message only).

Events in use:

| Event                                    | Level | Meaning                                                        |
| ---------------------------------------- | ----- | -------------------------------------------------------------- |
| `auth.role_lookup_failed`                | error | Admin role check failed; the user is treated as non-admin      |
| `itineraries.global_daily_limit_reached` | error | Platform AI cap hit; generation refused until the next IST day |
| `itineraries.log_failed`                 | error | Finishing a generation log failed (result still returned)      |
| `health.database_unreachable`            | error | `/api/health` couldn't read from the database                  |
| `<feature>.<action>_failed`              | error | Unexpected error in a Server Action (`toLoggedFailure`)        |

## Health check

`GET /api/health` → `200 {"status":"ok","checks":{"database":"ok"},"release":"abc1234"}` or `503` with
`"degraded"` when one anonymous read (3 s timeout) fails. Never cached, no details beyond pass/fail.
Use it for an uptime monitor (every 1–5 minutes) and for post-deploy smoke checks (`release` confirms
which commit is live). Verified locally: 200 normally, 503 within 3 s with the database paused.

## Database signals (run in the Supabase SQL editor)

Read-only queries; thresholds are starting points to tune with real traffic.

```sql
-- Booking sweep is running (pg_cron). Alert: no successful run in 30 minutes.
select status, start_time, return_message from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'himverse-booking-sweep')
order by start_time desc limit 5;

-- Requests close to expiry with no provider reply. Alert: any provider with > 5.
select provider_id, count(*) from public.bookings
where status = 'requested' and request_expires_at < now() + interval '12 hours'
group by 1 order by 2 desc;

-- Expired share over 7 days (providers not responding). Alert: > 30 %.
select round(100.0 * count(*) filter (where status = 'expired') / nullif(count(*), 0), 1) as expired_pct
from public.bookings where created_at > now() - interval '7 days';

-- AI generation health, last 24 h. Alert: failure rate > 20 % or p95 latency > 40 s.
select outcome, count(*), percentile_cont(0.95) within group (order by latency_ms) as p95_ms,
       sum(input_tokens) as input_tokens, sum(output_tokens) as output_tokens
from public.itinerary_generations where created_at > now() - interval '24 hours' group by 1;

-- Stuck reservations (function killed mid-generation). Alert: > 10 per day.
select count(*) from public.itinerary_generations
where outcome = 'pending' and created_at < now() - interval '15 minutes'
  and created_at > now() - interval '24 hours';

-- Platform AI usage today vs AI_DAILY_GENERATION_LIMIT. Alert: > 80 % of the limit.
select public.ai_generations_today();
```

Integrity checks that must always return **zero rows** (any row is a Sev 1):

```sql
select id from public.availability_slots where seats_confirmed > capacity;
select slot_id, traveler_id from public.bookings where status in ('requested', 'confirmed')
group by 1, 2 having count(*) > 1;
```

## Performance baseline (local, Phase 5)

Measured on the local stack with ~5k published experiences, 100k dates, 50k bookings and 100k
generation logs (details in the Phase 5 report). Public pages render in 13–30 ms, except experience
listing and search at ~120–150 ms. That cost grows linearly with the number of experiences, because
RLS evaluates two visibility functions per row and each page also counts matches. Revisit when
published experiences exceed ~3,000 or listing p95 exceeds 300 ms: options are a maintained
`is_public` column with a partial index, or capping the exact count.

## Planned

- Error tracking (Sentry via Vercel Marketplace) with source maps and release tagging; extend the CSP
  `connect-src` for its ingest host.
- Uptime monitor on `/api/health` with alerting to the on-call owner.
- Alerts for the SQL signals above (scheduled query or a monitoring vendor).

## Open questions

Monitoring vendor for alerts; log retention requirements; whether product analytics is in MVP scope.
