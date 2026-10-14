# Architecture Decision Records

ADRs capture significant decisions: their context, the choice, and its consequences. They are
immutable once accepted — to change a decision, write a new ADR that supersedes the old one.

## When an ADR is required

- Adding a service, runtime, or infrastructure component
- Adding a dependency that shapes architecture (ORM, state library, AI SDK, payments SDK)
- Data model decisions that are expensive to reverse
- Changes to authentication, authorization model, or trust boundaries
- Choosing an external vendor (AI provider, payments, email, monitoring)

## Process

1. Copy the template below to `ADR-NNNN-SHORT-TITLE.md` (next number, zero-padded).
2. Status `Proposed`; open a PR for discussion.
3. On merge, status becomes `Accepted`. Superseded ADRs link to their replacement.

## Index

| ADR                                               | Title                                                                | Status   |
| ------------------------------------------------- | -------------------------------------------------------------------- | -------- |
| [0001](ADR-0001-MODULAR-MONOLITH.md)              | Start as a modular monolith                                          | Accepted |
| [0002](ADR-0002-AUTHORIZATION-MODEL.md)           | Authorization model: database-enforced roles and provider membership | Accepted |
| [0003](ADR-0003-AI-ITINERARY-GENERATION.md)       | AI itinerary generation: provider, grounding and persistence         | Accepted |
| [0004](ADR-0004-BOOKING-LIFECYCLE.md)             | Booking lifecycle: slots, provider confirmation and idempotency      | Accepted |
| [0005](ADR-0005-PAYMENTS-RAZORPAY.md)             | Payments with Razorpay: server-verified states, webhooks, refunds    | Proposed |
| [0006](ADR-0006-SWITCHABLE-AI-PROVIDER-OLLAMA.md) | Switchable AI provider, with Ollama for free local models            | Accepted |

## Template

```markdown
# ADR-NNNN: Title

- Status: Proposed | Accepted | Superseded by ADR-XXXX
- Date: YYYY-MM-DD
- Deciders: names/roles

## Context

What forces are at play? What problem are we solving?

## Decision

What we will do.

## Alternatives considered

Options and why they were rejected.

## Consequences

Positive, negative, and follow-up work.
```
