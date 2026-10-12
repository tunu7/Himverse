# Incident Response

Lightweight process for a small team; expand before launch.

## Severity

| Sev | Examples                                                          | Response         |
| --- | ----------------------------------------------------------------- | ---------------- |
| 1   | Data exposure, secret leak, bookings falsely confirmed, site down | Immediately      |
| 2   | Booking or itinerary generation broken for many users             | Same day         |
| 3   | Degraded feature with workaround                                  | Next working day |

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

### Suspected cross-user data access

Identify the table/policy, hotfix the policy via migration, add a pgTAP test reproducing the leak,
review logs for the exposure window.

### AI producing harmful or false content

Disable generation (feature flag or env toggle, to be added in Phase 2), keep existing itineraries
viewable, add eval cases reproducing the output.

## Contacts

To be defined before launch (on-call owner, Supabase and Vercel account owners).
