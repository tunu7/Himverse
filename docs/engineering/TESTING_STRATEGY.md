# Testing Strategy

Test what would hurt if it broke: business rules, authorization boundaries, and critical user journeys.

## Layers

| Layer | Tool | Location | What to test |
| --- | --- | --- | --- |
| Unit | Vitest | `tests/unit/` | Pure logic: schemas, pricing, state transitions, AI output validation, error mapping |
| Integration | Vitest + `pg` + local Supabase | `tests/integration/` | Behaviour that needs parallel connections (booking concurrency, itinerary reservations); `npm run test:integration`, run in the CI database job. Guarded to the local database only (`tests/integration/local-db.ts`) |
| Database | pgTAP (`supabase test db`) | `supabase/tests/` | RLS policies per role, constraints, triggers, DB functions |
| E2E | Playwright (Chromium) | `tests/e2e/` | Critical journeys against a production build |
| A11y | axe-core in Playwright | `tests/e2e/accessibility.spec.ts` | WCAG 2.1 AA rules on every area, light and dark ([ACCESSIBILITY](ACCESSIBILITY.md)) |
| Smoke | Playwright (Chromium) | `tests/smoke/` | Read-only checks of a deployed environment (`STAGING_BASE_URL=… npm run test:smoke`); never signs in or writes data |

## Requirements

- Every table: pgTAP tests proving each role can do what it should **and cannot** do what it shouldn't
  (anonymous, traveler A vs traveler B, provider vs other provider, admin).
- Every Server Action: input validation and authorization failure paths tested (unit or integration).
- Booking: duplicate submission with the same idempotency key yields one booking.
- AI: invalid, ungrounded and malicious outputs are rejected ([AI_EVALUATION](../ai/AI_EVALUATION.md)).
- Critical E2E journeys (once built): browse catalogue → generate itinerary → refine → request booking →
  provider confirms.
- Async Server Components are covered by E2E, not Vitest (not supported by Vitest).

## Conventions

- Tests are deterministic: no real AI calls or external network in unit/integration tests; mock at the
  provider boundary. Real-model evaluations run separately.
- Test names describe behaviour: `rejects booking for an unpublished experience`.
- Fix or delete flaky tests; never `skip` to get a green build.

## Commands

`npm test` · `npm run test:e2e` (after `npm run build`; port 3100) · `npm run db:test` (Docker +
`npx supabase start`). CI runs unit tests, pgTAP database tests, a generated-types drift check, the
production build and E2E (against a throwaway local Supabase with `supabase/seed.sql`) on every PR.

E2E tests that need data rely on `supabase/seed.sql`. Database tests must not: each pgTAP file creates
its own fixtures and truncates seeded catalogue rows inside its rolled-back transaction.
