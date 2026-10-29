# MVP scope and requirements

The single source of truth for what is in and out of the MVP. If another document disagrees, this file
wins and the other must be corrected. Last reviewed: 2026-10-29. Status: **built** = implemented and
tested; _(planned)_ = decided by the owner, not built yet. Flows: [USER_FLOWS](USER_FLOWS.md); phases:
[ROADMAP](ROADMAP.md).

## Problem and vision

Planning a trip to Arunachal Pradesh is hard. Reliable information on experiences, local partners,
travel times and permits is scattered, and generic AI chatbots invent places, prices and availability.
Local partners (homestays, guides, operators) have no trusted way to reach travellers.

Himverse.AI is a trusted planning and booking platform. Every recommendation comes from a curated,
verified database, and AI only **composes and personalises** itineraries from that data; it never
invents them.

## Roles

Three account types, **one per account, fixed at creation and enforced in the database** (**built**,
[ADR-0007](../decisions/ADR-0007-ONE-ACCOUNT-TYPE-PER-ACCOUNT.md)):

| Role | In code | Can | Cannot |
| --- | --- | --- | --- |
| Traveller | `account_type = 'traveller'` | Browse, plan itineraries, book, pay deposits | Use the partner portal or console |
| Partner | partner account + `provider_members` | Manage listings and bookings in `/provider` | Book or plan trips |
| Admin | `admin` in `user_roles` | Verify partners, curate, moderate, oversee bookings and payments | Book or apply as a partner |

"Partner", "tourism partner" and "provider" mean the same thing: the UI says partner, the code says
provider.

## In scope

| Area | Included |
| --- | --- |
| Region | Arunachal Pradesh only |
| Accounts | **Built:** email/password with confirmation and resend, Google sign-in, password reset and change, TOTP two-step login required for partners and admins, self-serve account deletion ([ADR-0009](../decisions/ADR-0009-ACCOUNT-DELETION-AND-ALERTS.md)) |
| Areas | **Built:** traveller site, partner portal `/provider` (dashboard and listings adapt to the types a partner offers; online/offline per listing and per type), admin console `/admin` |
| Catalogue | **Built:** admin-curated destinations; listings managed by partners, publishable only while verified; admin moderation; search, filters, detail pages |
| Listings | **Built:** experiences, guides, stays (one room type), transport (vehicle hire), each with capacity per day ([ADR-0008](../decisions/ADR-0008-LISTING-TYPES.md)) |
| Itinerary | **Built:** AI plans grounded in bookable listings: experiences, stays, transport and guides, each only while its partner accepts bookings (experiences only with an open date during the trip); refine, regenerate, versions; Ollama (Cloud in production) or AI Gateway ([ADR-0006](../decisions/ADR-0006-SWITCHABLE-AI-PROVIDER-OLLAMA.md)) |
| Booking | **Built:** **instant booking** at the listed price for all listing types, with capacity checked (owner decision 2026-10-29); experiences on published dates only; "Book whole trip"; partner switch; listings without a price stay requests the partner prices and the traveller accepts; cancellation; expiry; in-app alerts ([BOOKING_POLICY](BOOKING_POLICY.md)) |
| Payments | **Built (Test Mode):** 50% online deposits via Razorpay, due within 1 hour of an instant booking, refunds by cancellation timing, manual partner payouts; off until an admin turns them on ([ADR-0005](../decisions/ADR-0005-PAYMENTS-RAZORPAY.md)) |
| Admin | **Built:** overview, partner verification, destinations, moderation, bookings, payments, users |
| Legal | **Built:** privacy policy and terms pages (legal review pending) |

## Out of scope for the MVP

- Full prepayment, automatic payouts (Razorpay Route), commissions, invoicing, dynamic pricing
- Reviews and ratings; email or SMS notifications (needs a sending domain); real-time chat
- Regions beyond Arunachal Pradesh
- Third-party inventory (flights, trains, buses, hotel aggregators); partner-run stays and transport
  are in scope
- Native mobile apps; offline mode beyond graceful degradation
- Separate backend services (Python/FastAPI) unless an ADR justifies one

## Quality requirements

- **Security:** RLS on all data, least privilege, server-only secrets ([SECURITY](../security/SECURITY.md)).
- **Trust:** the traveller never sees "confirmed" or "paid" before authoritative confirmation, and
  AI content is labelled as such.
- **Reliability:** booking and payment operations are safe under retries and double submits.
- **Performance:** catalogue pages use static shells with streamed personal sections. AI generation
  shows progress, and pages degrade gracefully on slow networks.
- **Accessibility:** WCAG 2.1 AA, with automated checks on every area
  ([ACCESSIBILITY](../engineering/ACCESSIBILITY.md)).

## Definition of done

Every in-scope flow in [USER_FLOWS](USER_FLOWS.md) works end to end in production, with:

- RLS tests for every table;
- E2E tests for the critical journeys (browse → plan → refine → book (confirmed instantly) → pay the
  deposit);
- no known high-severity security issues.

Initial success metrics (to validate):

- the share of AI plans that are valid and grounded;
- plans that lead to a booking request;
- partner response time (requests for listings without a price);
- duplicate bookings (target: zero).

## Open questions

- **Provider verification:** what documents, whether field visits are needed, and who does it.
- **Inner Line Permit:** information only, or assisted.
- **AI cost:** a cost ceiling for Ollama Cloud.
- **Languages and currency:** languages beyond English, and currency display (INR only today).
- **Commission:** whether there is a platform commission, and confirming the deposit payout rule
  ([PAYMENTS](../operations/PAYMENTS.md)).
