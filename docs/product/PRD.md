# Product Requirements — Himverse.AI MVP

Status: Draft v0.1 (2026-10-12). Owner: Product. Related: [MVP_SCOPE](MVP_SCOPE.md), [USER_FLOWS](USER_FLOWS.md).

## Problem

Travelers to Arunachal Pradesh and the wider Himalaya struggle to plan trips: reliable information on
experiences, local providers, travel times and permits is fragmented, and generic AI chatbots
confidently invent places, prices and availability. Local providers (homestays, guides, tour operators)
lack a trusted channel to reach these travelers.

## Vision

A trusted planning and booking platform where every recommended experience comes from a curated,
verified database, and AI is used to _compose and personalise_ itineraries from that data — never to
invent it.

## Target users

| Persona            | Need                                                                   |
| ------------------ | ---------------------------------------------------------------------- |
| Traveler           | Discover experiences, get a realistic itinerary, book with confidence. |
| Provider           | List experiences, manage availability, receive and confirm bookings.   |
| Himverse admin/ops | Verify providers, curate content, handle disputes and support.         |

## Goals (MVP)

1. Travelers can browse curated experiences and verified providers in Arunachal Pradesh.
2. Travelers can generate an itinerary from preferences (dates/duration, budget, interests, pace,
   constraints) that references only catalogue items in our database.
3. Travelers can refine the itinerary conversationally or via structured controls.
4. Travelers can request a booking for an available experience; the booking is confirmed only by an
   authoritative source (provider confirmation and/or payment state).
5. Travelers can view their trips and booking status.

## Non-goals (MVP)

Flights, trains, and generic hotel inventory; regions beyond Arunachal Pradesh; native mobile apps;
provider payouts automation; public reviews (post-MVP — see [ROADMAP](ROADMAP.md)).

## Functional requirements

- **Catalogue:** experiences with region, category, duration, price range, provider, media, seasonality
  and accessibility notes. Only verified providers' published experiences are visible to travelers.
- **Itinerary generation:** structured input → validated itinerary of day plans referencing catalogue
  item IDs; travel-time and seasonality constraints respected; clear labelling of AI-generated content.
- **Refinement:** modify budget, duration, pace, interests, swap/remove items; preserve history of versions.
- **Booking:** request → pending → confirmed / declined / cancelled / expired; idempotent creation;
  traveler never sees "confirmed" before authoritative confirmation.
- **Accounts:** email-based sign-in via Supabase Auth; roles traveler, provider, admin.

## Non-functional requirements

- Security: RLS on all data; least privilege; secrets server-only ([SECURITY](../security/SECURITY.md)).
- Performance: catalogue pages statically shell-rendered with streamed personalised sections; itinerary
  generation shows progress and tolerates multi-second latency.
- Reliability: booking operations safe under retries and double-submits.
- Accessibility: WCAG 2.2 AA target for traveler flows.
- Connectivity: many target areas have poor connectivity — pages must degrade gracefully on slow networks.

## Success metrics (initial, to be validated)

Itinerary generation success rate (valid, grounded output); share of generated itineraries that lead to
a booking request; provider confirmation time; booking error/duplicate rate (target: zero duplicates).

## Open questions

- Payment provider and whether MVP takes payment online or confirms bookings with pay-at-provider.
- Provider verification process (documents, field visits) and who performs it.
- Inner Line Permit (ILP/PAP) guidance: informational only, or integrated assistance?
- AI model/provider choice and cost ceiling per itinerary (see [AI_ARCHITECTURE](../ai/AI_ARCHITECTURE.md)).
- Languages beyond English (Hindi? local languages?) and currency display (INR only?).
- Cancellation and refund policy ownership (platform vs provider).
