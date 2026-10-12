# AI Architecture

Status: design only. No AI provider, SDK or key is configured.

## Principle: our database is the source of truth

The model **composes and explains**; it does not supply facts. Places, experiences, providers, prices,
availability and booking status come from our database. The model receives candidate items with IDs and
returns a plan that references those IDs.

## Components (planned, `src/server/itineraries/`)

1. **Input schema** — validated trip parameters.
2. **Retriever** — SQL/filters over published catalogue data (region, season, duration, budget, interests).
   Semantic search (pgvector) only if structured filters prove insufficient — via ADR.
3. **Prompt builder** — versioned prompt templates (`prompt_version` stored with each output). User free text
   is placed in clearly delimited data sections, never concatenated into instructions.
4. **Model client** — single adapter module so the provider can be swapped; timeouts and bounded retries.
5. **Output validator** — Zod schema for the itinerary structure (structured output / JSON mode).
6. **Grounding check** — every referenced ID exists, is published, from a verified provider, and fits
   constraints (dates/season, durations, travel time); otherwise reject or repair.
7. **Persistence** — store validated itinerary versions separate from curated data with metadata
   (model, prompt version, latency, token usage, validation outcome).

## Safety rules

- AI output never writes to curated tables and is never shown as availability, price guarantee or booking.
- The model gets no tools that mutate data. If tool use is added, tools are read-only and authorization-scoped.
- Prompt injection: catalogue content and user text are data; validation + grounding limit impact even if
  the model is manipulated.
- Rate-limit generation per user; cap tokens per request; track cost.
- Do not send unnecessary personal data to the provider; check the provider's data retention terms.

## Open questions (resolve via ADR before Phase 3)

- Model provider and model (quality vs cost vs latency for Indian users); use of an AI gateway for
  provider fallback and spend tracking.
- SDK choice (provider SDK vs a provider-agnostic SDK).
- Streaming partial itineraries vs returning complete validated results.
- Cost ceiling per itinerary and per user per day.
- Language support for prompts and outputs.
