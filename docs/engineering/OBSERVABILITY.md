# Observability

Status: minimal. No logging library or monitoring vendor is installed yet.

## Now

- Server logs go to Vercel function logs via `console` with structured objects:
  `console.error({ event: "booking.request_failed", requestId, userId, code, err })`.
- **Never log** secrets, tokens, full cookies, payment data, or full AI prompts containing personal data.
  Log user IDs, not emails or phone numbers.
- Supabase logs (Postgres, Auth, API) are available in the Supabase dashboard.

## Planned (Phase 4, each via ADR)

- Error tracking vendor with source maps and release tagging.
- Next.js `instrumentation.ts` with OpenTelemetry for traces across Server Actions, DB and AI calls.
- Metrics/alerts for: itinerary generation success rate and latency, AI cost per itinerary, booking
  request failures, duplicate-booking detections (should be zero), auth error spikes.
- A small `src/lib/logger.ts` wrapper once structured fields need consistency across modules — not before.

## AI-specific signals

Record per generation: model, latency, token usage, validation outcome (valid / schema-invalid /
ungrounded), retry count. Store evaluation-relevant metadata, not raw personal data
([AI_EVALUATION](../ai/AI_EVALUATION.md)).

## Open questions

Monitoring vendor; log retention requirements; whether analytics (product) is in MVP scope.
