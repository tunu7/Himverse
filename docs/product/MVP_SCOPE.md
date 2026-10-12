# MVP Scope

The single source of truth for what is in and out of the MVP. If another document disagrees, this file wins
and the other document must be corrected.

## In scope

| Area      | Included                                                                                  |
| --------- | ----------------------------------------------------------------------------------------- |
| Region    | Arunachal Pradesh only                                                                    |
| Accounts  | Supabase Auth (email sign-in); roles: traveler, provider, admin                           |
| Catalogue | Admin-curated destinations and experiences; verified provider profiles; browse and filter |
| Itinerary | AI-generated itinerary grounded in catalogue data; structured refinement; saved versions  |
| Booking   | Booking requests for available experiences; provider confirm/decline; status tracking     |
| Trip view | Traveler sees their itineraries, bookings and essential trip information                  |
| Admin     | Minimal tools to verify providers and publish/unpublish catalogue items                   |

## Out of scope for MVP

- Reviews and ratings (planned next — see [ROADMAP](ROADMAP.md))
- Online payment capture **until the payment open question is resolved** (see [PRD](PRD.md#open-questions))
- Regions beyond Arunachal Pradesh
- Transport bookings (flights, trains, buses), generic hotel inventory
- Native mobile apps, offline mode beyond graceful degradation
- Provider payouts, invoicing, dynamic pricing
- Separate backend services (Python/FastAPI) — not until justified by an ADR
- Real-time chat between travelers and providers

## Definition of done for the MVP

All in-scope flows in [USER_FLOWS](USER_FLOWS.md) work end-to-end in the preview environment with:
RLS policy tests for every table, E2E tests for the critical journeys (browse → generate → refine →
request booking → provider confirms), and no known security issues of high severity.
