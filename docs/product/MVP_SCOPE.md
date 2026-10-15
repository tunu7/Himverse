# MVP Scope

The single source of truth for what is in and out of the MVP. If another document disagrees, this file wins
and the other document must be corrected. Last reviewed: 2026-10-15 (owner decisions folded in).

Status key: **built** = implemented and tested in this repo · _(planned)_ = decided by the owner, not built yet.

## Roles and terminology

Three account types, **one per account, fixed at creation** _(planned: enforced in the database; today
roles come from `user_roles` and provider membership per [ADR-0002](../decisions/ADR-0002-AUTHORIZATION-MODEL.md),
superseded in part by [ADR-0007](../decisions/ADR-0007-ONE-ACCOUNT-TYPE-PER-ACCOUNT.md))_:

| Role      | In code                          | Can                                                        | Cannot                         |
| --------- | -------------------------------- | ---------------------------------------------------------- | ------------------------------ |
| Traveller | signed-in, no role or membership | Browse, plan itineraries, request bookings                 | Use the partner portal/console |
| Partner   | row in `provider_members`        | Manage listings and booking requests in the partner portal | Book, or act as a traveller    |
| Admin     | `admin` in `user_roles`          | Verify partners, curate catalogue, oversee bookings        | Book, or apply as a partner    |

"Partner", "tourism partner" and "provider" mean the same thing; UI copy says partner, code says provider.

## In scope

| Area      | Included                                                                                                                                                                                                                                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Region    | Arunachal Pradesh only                                                                                                                                                                                                                                                                                                          |
| Accounts  | **Built:** Supabase Auth email/password, email confirmation, Google sign-in, role-based landing. _(planned)_ password reset and change, resend confirmation, TOTP 2-step sign-in required for admins and partners                                                                                                               |
| Areas     | **Built:** traveller site `(site)`, partner portal `/provider`, admin console `/admin`                                                                                                                                                                                                                                          |
| Catalogue | **Built:** admin-curated destinations; experiences managed by partners, publishable only while the partner is verified; admins can unpublish; search, filter, detail pages                                                                                                                                                      |
| Listings  | **Built:** experiences, guides (per group or per person per day), stays (one room type: nights + rooms), transport (vehicle hire: trip or day, route) — bookable with capacity per day ([ADR-0008](../decisions/ADR-0008-LISTING-TYPES.md)). Stays and transport are used in AI itineraries and booked with the whole trip (3b) |
| Itinerary | **Built:** AI itinerary grounded in bookable catalogue items; refine, regenerate, saved versions. Model via Ollama (Cloud in production) or Vercel AI Gateway ([ADR-0006](../decisions/ADR-0006-SWITCHABLE-AI-PROVIDER-OLLAMA.md))                                                                                              |
| Booking   | **Built:** requests for any future date or a published slot; "Book whole trip" from an itinerary; partner accept-bookings switch; confirm/decline with final price; cancellation; expiry ([BOOKING_POLICY](BOOKING_POLICY.md))                                                                                                  |
| Trip view | **Built:** traveller's itineraries and bookings with status                                                                                                                                                                                                                                                                     |
| Admin     | **Built:** overview, partner verification, destinations, experience moderation, bookings                                                                                                                                                                                                                                        |

## Out of scope for MVP

- Full online prepayment, automatic partner payouts (Razorpay Route) and commissions. _Added 2026-10-15 by the owner:_ online 50% deposits ([ADR-0005](../decisions/ADR-0005-PAYMENTS-RAZORPAY.md)), off until an admin turns them on
- Reviews and ratings (planned next — see [ROADMAP](ROADMAP.md))
- Regions beyond Arunachal Pradesh
- Third-party inventory: flights, trains, public buses, hotel aggregators or channel managers.
  (Transport and stays offered **by verified local partners** are in scope as listing types.)
- Native mobile apps, offline mode beyond graceful degradation
- Partner payouts, invoicing, dynamic pricing
- Notifications by email/SMS beyond Supabase auth emails (open question in [BOOKING_POLICY](BOOKING_POLICY.md))
- Separate backend services (Python/FastAPI) — not until justified by an ADR
- Real-time chat between travellers and partners

## Definition of done for the MVP

All in-scope flows in [USER_FLOWS](USER_FLOWS.md) work end-to-end in production with: RLS policy tests for
every table, E2E tests for the critical journeys (browse → generate → refine → request booking → partner
confirms), and no known high-severity security issues.
