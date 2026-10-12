# ADR-0001: Start as a modular monolith

- Status: Accepted
- Date: 2026-10-12
- Deciders: Engineering (foundation task)

## Context

Himverse.AI is pre-MVP with a small team. The MVP needs a catalogue, accounts, AI itinerary generation
and bookings. Requirements will change quickly. Operational capacity for multiple services is limited,
and nothing yet requires a separate runtime (no Python-only ML dependency, no measured scaling hotspot).

## Decision

Build a single Next.js application (one npm package, no workspaces) deployed to Vercel, using Supabase
for Postgres and Auth. Organise code into feature modules (`src/features`) and server-only domain modules
(`src/server`) with a downward-only dependency rule, so modules can be extracted later if needed.

## Alternatives considered

- **Microservices / separate FastAPI backend:** independent scaling and Python ML ecosystem, but adds
  deployment, auth propagation, network failure modes and duplicated validation with no current need.
- **Turborepo monorepo with packages:** useful for multiple apps sharing code; we have one app, so it adds
  build configuration without benefit.

## Consequences

- Positive: one deploy, one type system end-to-end, simple local setup, fast iteration.
- Negative: boundaries are enforced by convention and review, not by package isolation; heavy AI workloads
  share the function runtime with the web app.
- Follow-up: revisit with a new ADR if AI workloads need Python libraries, exceed function limits, or a
  second application (e.g. provider mobile app backend) appears.
