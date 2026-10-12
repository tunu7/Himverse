# Roadmap

Phases are ordered; dates are intentionally omitted until the team commits to them.

## Phase 0 — Engineering foundation ✅ (2026-10-12)

Repository, documentation, Claude Code configuration, CI quality gates, minimal Next.js skeleton.

## Phase 1 — Catalogue and accounts (implemented locally 2026-10-12; not deployed)

Done: email/password auth, `src/proxy.ts` session refresh, profiles, admin role (ADR-0002), provider
applications and admin verification, destinations and experiences with RLS, `/explore` (T1, P1, A1
minimum). Security-reviewed twice; CI green on GitHub. Remaining for Phase 1: admin
destination-editing UI (destinations are seed/SQL only), experience editing UI beyond create and status
changes, provider staff invitations.

## Phase 2 — Tourism discovery (implemented locally 2026-10-12; not deployed)

Public `/destinations` and `/experiences` with full-text search, region (district), category, budget and
duration filters, sorting, pagination and shareable URLs; destination and experience detail pages;
`/explore` redirects to `/experiences` (T1). Text-only for now: imagery needs a storage design (ADR).
Inserted before itinerary generation, so later phases shifted by one.

## Phase 3 — Itinerary generation

AI provider ADR, retrieval from catalogue, structured generation and validation, grounding checks,
evaluation dataset, refinement and versioning (T2, T3).

## Phase 4 — Booking

Availability model, booking request lifecycle with idempotency, provider booking management,
notifications; payment integration once the provider is chosen by ADR (T4, P2, T5).

## Phase 5 — MVP hardening and launch

Accessibility audit, performance on slow networks, observability and alerting, incident runbooks,
security review, production Supabase project and Vercel production domain.

## Post-MVP

Reviews and ratings · expansion across Northeast India, then the wider Himalayan region · multi-language
support · provider payouts · richer offline support.
