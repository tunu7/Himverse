# Incident Response

Lightweight process for a small team; expand before launch.

## Severity

| Sev | Examples | Response |
| --- | --- | --- |
| 1 | Data exposure, secret leak, bookings falsely confirmed, site down | Immediately |
| 2 | Booking or itinerary generation broken for many users | Same day |
| 3 | Degraded feature with workaround | Next working day |

## Steps

1. **Detect & declare:** note time, symptoms, severity; one person coordinates.
2. **Contain:** roll back the Vercel deployment; disable the affected feature; for secret leaks, rotate the
   key in Supabase/Vercel first, then investigate.
3. **Communicate:** inform affected providers/travelers when bookings or personal data are affected.
   Legal notification duties (e.g. DPDP Act) are an open question for legal review.
4. **Fix:** forward fix with tests that reproduce the issue.
5. **Review:** blameless write-up within a week: timeline, root cause, what prevented earlier detection,
   follow-up actions. Store in `docs/operations/incidents/` (created at the first incident).

## Runbooks

### Leaked secret key

Rotate `SUPABASE_SECRET_KEY` in Supabase → update Vercel env → redeploy → audit Supabase logs for misuse.

### Suspected account compromise

1. Supabase → Authentication → Users: find the user and **sign them out of all sessions** (revokes
   refresh tokens; access tokens expire within an hour).
2. If the password may be known, send a password reset; if a phone number was added that the person
   doesn't recognise, remove it from the user in Supabase.
3. For partners and admins, delete their TOTP factor only after verifying the person out-of-band
   ([SECURITY](../security/SECURITY.md#accounts-and-sign-in)).
4. Review their bookings, listings and payouts for changes in the window, and the logs for
   `auth.sms_code_sent`, `auth.phone_linked` and `security.rate_limited` around it.

### SMS cost spike or SMS pumping

Set `SMS_DAILY_LIMIT=0` in Vercel and redeploy, or disable the Phone provider in Supabase (immediate).
Check the provider's per-country spend, tighten its geo-permissions, then restore a lower limit. Look for
`security.rate_limited` with `sms_*` buckets in the logs.

### Suspected cross-user data access

Identify the table/policy, hotfix the policy via migration, add a pgTAP test reproducing the leak,
review logs for the exposure window.

### AI producing harmful or false content, or runaway cost

Set `AI_ITINERARY_ENABLED=false` in Vercel and redeploy the current deployment (env changes apply only
to new deployments). Generation stops with a "temporarily unavailable" message; saved itineraries stay
viewable. For cost only, lower `AI_DAILY_GENERATION_LIMIT` instead. Add eval cases reproducing the
output before re-enabling.

### Site or database down

`/api/health` returns 503 with `"database":"error"`. Check the Supabase status page and project
dashboard; if a deploy coincided, promote the previous Vercel deployment. Data loss or corruption:
[BACKUP_AND_RESTORE](BACKUP_AND_RESTORE.md) (PITR first).

### Booking requests not expiring or completing

The `pg_cron` sweep isn't running. Check `cron.job` and `cron.job_run_details`
([OBSERVABILITY](../engineering/OBSERVABILITY.md)). The functions still refuse late confirmations, so
this is Sev 3 unless it persists; re-create the schedule with a forward migration if it's missing.

### Abuse spike (spam requests, applications or dates)

Database limits cap each account ([SECURITY](../security/SECURITY.md#rate-limits)).
For one abusive account, ban the user in Supabase Auth and decline or cancel their requests. If the
limits are too loose, tighten them with a migration. Many accounts → enable or tighten CAPTCHA and
Supabase Auth rate limits.

## Contacts

To be defined before launch (on-call owner, Supabase and Vercel account owners).
