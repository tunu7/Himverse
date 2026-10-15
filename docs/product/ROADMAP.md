# Roadmap

Phases are ordered; dates are intentionally omitted until the team commits to them. Scope:
[MVP_SCOPE](MVP_SCOPE.md). Production (Vercel + Supabase) is live with sample content.

## Phase 0 — Engineering foundation ✅ (2026-10-12)

Repository, documentation, Claude Code configuration, CI quality gates, minimal Next.js skeleton.

## Phase 1 — Catalogue and accounts ✅

Email/password auth, `src/proxy.ts` session refresh, profiles, admin role (ADR-0002), provider
applications and admin verification, destinations and experiences with RLS. Google sign-in added
2026-10-13. Remaining: admin destination-editing UI beyond the console, experience editing beyond create
and status changes, partner staff invitations.

## Phase 2 — Tourism discovery ✅

Public `/destinations` and `/experiences` with full-text search, district, category, budget and duration
filters, sorting, pagination and shareable URLs; detail pages. Text-only: imagery needs a storage ADR.

## Phase 3 — Itinerary generation ✅

ADR-0003 and ADR-0006: deterministic retrieval of bookable items, versioned prompt (`itinerary-v3`),
validated structured output, grounding and budget checks, a save RPC that checks ownership and
visibility, refine/regenerate/restore, rate limits. Production runs Ollama Cloud (`gpt-oss:120b`).
Remaining: evaluation set ([AI_EVALUATION](../ai/AI_EVALUATION.md)), streaming progress.

## Phase 4 — Booking ✅

ADR-0004: request → partner confirm/decline with a final price, cancellation, 48 h expiry and completion
through `pg_cron`, idempotent requests, no overbooking, audited history. 2026-10-15: any-date requests,
partner accept-bookings switch, "Book whole trip". No payments. Open questions:
[BOOKING_POLICY](BOOKING_POLICY.md).

## Phase 5 — Production readiness (in progress)

Done: Workstream A (security hardening, health check, rate limits, AI kill switch), separate traveller
site / partner portal / admin console, Vercel and Supabase production. Remaining
([RELEASE_CHECKLIST](../operations/RELEASE_CHECKLIST.md)): staging Supabase project for previews, error
tracking and alerting, custom SMTP, CAPTCHA, accessibility audit, slow-network performance, remove sample
content before launch.

## Phase 6 — Accounts and partner listings _(planned, owner decisions 2026-10-15)_

1. One role per account (traveller, partner or admin), fixed at creation and enforced in the database —
   [ADR-0007](../decisions/ADR-0007-ONE-ACCOUNT-TYPE-PER-ACCOUNT.md); database migration in progress.
2. Auth: password reset and change, resend confirmation email, TOTP 2-step sign-in required for admins
   and partners.
3. Partner listing types beyond experiences: guides (date + group), accommodation (nights + rooms),
   transport (date + route/vehicle); bookable and usable by AI itineraries. Needs a data-model ADR.

## Post-MVP

Online payments (ADR-0005, proposed) · reviews and ratings · email/SMS notifications · expansion across
Northeast India, then the wider Himalayan region · multi-language support · partner payouts · richer
offline support.
