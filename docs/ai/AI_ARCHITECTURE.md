# AI Architecture

Status: design only. No AI provider, SDK or key is configured.

## Principle: our database is the source of truth

The model **composes and explains**; it does not supply facts. Places, experiences, providers, prices,
availability and booking status come from our database. The model receives candidate items with IDs and
returns a plan that references those IDs.

## Components (implemented, `src/server/itineraries/`)

See [ITINERARY_GENERATION](ITINERARY_GENERATION.md) for the module map and checks, and
[ADR-0003](../decisions/ADR-0003-AI-ITINERARY-GENERATION.md) for the decisions.

1. **Input schema:** validated trip preferences.
2. **Retriever:** deterministic SQL filters over public catalogue data (region, interests, duration,
   budget). Semantic search only via a future ADR.
3. **Prompt builder:** versioned (`itinerary-v1`), stored with each version. Records appear as aliases;
   traveller text is fenced as data.
4. **Model client:** the `ItineraryModel` interface, with the Vercel AI Gateway adapter (AI SDK 7) and a
   deterministic test mock. Timeout, bounded retries, capped output.
5. **Output validator:** Zod schema `itinerary.v1`.
6. **Grounding check:** aliases, dates, capacity, multi-day items and budget from database prices, plus
   the save RPC's visibility re-check.
7. **Persistence:** immutable itinerary versions and items, separate from curated data. A generation log
   records model, prompt version, latency, tokens and outcome (no prompt text).

## Safety rules

- AI output never writes to curated tables and is never shown as availability, price guarantee or booking.
- The model gets no tools that mutate data. If tool use is added, tools are read-only and authorization-scoped.
- Prompt injection: catalogue content and user text are data; validation + grounding limit impact even if
  the model is manipulated.
- Rate-limit generation per user; cap tokens per request; track cost.
- Do not send unnecessary personal data to the provider; check the provider's data retention terms.

## Decided (ADR-0003)

- **Provider:** Vercel AI Gateway through AI SDK 7, model `anthropic/claude-sonnet-5.5` (configurable).
- **Results:** complete, validated results are returned (no partial streaming).
- **Limits:** 10 generations per hour and 30 per day per user; output tokens capped per request.

## Open questions

- Monetary cost ceiling per itinerary. This needs real usage data, so a gateway key first.
- Language support for prompts and outputs (English only today).
- The gateway's zero-data-retention settings for production.
