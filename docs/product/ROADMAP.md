# Roadmap

Phases are ordered; dates are intentionally omitted until the team commits to them.

## Phase 0 — Engineering foundation ✅ (2026-10-12)

Repository, documentation, Claude Code configuration, CI quality gates, minimal Next.js skeleton.

## Phase 1 — Catalogue and accounts

Auth (Supabase, `src/proxy.ts` session refresh), roles, provider and experience schema with RLS,
admin curation tools, public catalogue browsing (T1, P1, A1).

## Phase 2 — Itinerary generation

AI provider ADR, retrieval from catalogue, structured generation and validation, grounding checks,
evaluation dataset, refinement and versioning (T2, T3).

## Phase 3 — Booking

Availability model, booking request lifecycle with idempotency, provider booking management,
notifications; payment integration once the provider is chosen by ADR (T4, P2, T5).

## Phase 4 — MVP hardening and launch

Accessibility audit, performance on slow networks, observability and alerting, incident runbooks,
security review, production Supabase project and Vercel production domain.

## Post-MVP

Reviews and ratings · expansion across Northeast India, then the wider Himalayan region · multi-language
support · provider payouts · richer offline support.
