# ADR-0003: AI itinerary generation — provider, grounding and persistence

- Status: Accepted
- Date: 2026-10-12
- Deciders: Product owner (provider, credentials, price unit), Engineering
- Implementation: Phase 3 — migration `20261012145550_itineraries`, `src/server/itineraries/`,
  `src/features/itineraries/`, routes under `/itineraries`

## Context

Travellers need day-by-day itinerary suggestions built from our own curated, verified inventory. The
existing [AI_ARCHITECTURE](../ai/AI_ARCHITECTURE.md) required a provider decision and these properties:

- the database is the source of truth;
- model output is untrusted;
- AI output is stored apart from curated data;
- nothing is presented as availability, a price guarantee or a booking.

The app runs on Vercel as a modular monolith ([ADR-0001](ADR-0001-MODULAR-MONOLITH.md)). Private
data follows [ADR-0002](ADR-0002-AUTHORIZATION-MODEL.md): owner-only, enforced by RLS.

## Decision

### 1. Provider: Vercel AI Gateway through AI SDK 7

- **Library:** `ai@7` is the only new dependency; it bundles the gateway provider.
- **Model:** a `provider/model` string, `AI_ITINERARY_MODEL`, defaulting to
  `anthropic/claude-sonnet-5.5`, current in the gateway's model list on 2026-10-12.
- **Authentication:** `AI_GATEWAY_API_KEY` locally, read only through `src/lib/env.server.ts`; OIDC on
  Vercel.
- **Structured output:** `generateText` with `Output.object({ schema })`, schema version
  `itinerary.v1`.
- **Limits:** a 45 s timeout, one SDK retry, and capped output tokens.
- **Replaceable:** the pipeline depends only on the `ItineraryModel` interface
  (`src/server/itineraries/model/types.ts`). A deterministic mock (`AI_PROVIDER=mock`) serves automated
  tests and is **refused when `VERCEL_ENV=production`**.

### 2. Grounding: the model chooses, the server decides

1. **Retrieval is deterministic SQL through the anonymous client.** Only publicly visible inventory can
   be a candidate. Filters:
   - region or destination;
   - interests, widened to all categories (and labelled as widened) if they can't fill the trip;
   - fits the trip length;
   - no single experience over the whole budget.

   Results are capped at 40 experiences and 10 destinations. **If nothing is found, the model is not
   called and nothing is invented.**

2. **The model sees aliases (`E1`, `D1`), never database IDs.** The prompt also contains no prices and
   no account data. Traveller notes are fenced as data.
3. **Output is checked twice.** The schema check runs first. Then deterministic validation
   (`validate.ts`) checks:
   - every alias is from the retrieved set;
   - exactly N days, with dates derived by the server;
   - no duplicate experiences;
   - each day's activity fits that pace's daily capacity;
   - multi-day experiences have their covered days kept free;
   - the budget, computed from **database prices**.

   **There is one repair attempt with the specific errors; then the request fails cleanly.**

4. **Persistence re-checks everything.** `save_itinerary_version` is a `security definer` function with
   `search_path=''`. It:
   - verifies ownership with `auth.uid()`;
   - rejects any experience that isn't publicly visible right now, or isn't at the stated destination
     (SQLSTATE `55000`);
   - snapshots title, price and duration **from the database**, and computes the estimated total itself.

### 3. Persistence and access

- **Tables:** `itineraries`, `itinerary_versions`, `itinerary_items` and `itinerary_generations`.
  `itinerary_generations` is a log for rate limiting and observability; it stores no prompt text or
  personal data.
- **Itineraries are owner-only, with no sharing.** Owners can select, rename, change the current version
  and delete. They **can't insert versions or items directly**; that goes only through the RPC.
- **Versions and items are immutable.** Deleting an itinerary cascades to them.
- **`current_version_id`** has a composite FK, so it can only point at a version of the same itinerary.
- **Rate limit:** 10 generations per hour and 30 per day per user, counted from the log before any
  model call.
- **Prices are per person** (product decision). The estimate is the sum of item prices × travellers,
  shown as an indicative minimum. Unpriced items are excluded and counted.
- **Currency is INR only**, because the catalogue has no other currency and there's no exchange-rate
  source.

## Alternatives considered

- **Anthropic API directly** (`@anthropic-ai/sdk`): one vendor and no gateway, but switching providers
  means a new adapter, and there are no gateway fallbacks or spend tracking. Not chosen. The adapter
  boundary keeps it a small change if wanted later.
- **Letting the model return database IDs and prices:** simpler prompts, but it trusts model output for
  facts and creates an ID-guessing surface. Rejected.
- **Security-invoker save RPC with direct insert grants:** would let owners write unvalidated plans
  into their own itineraries, and use FK errors to probe whether hidden experience IDs exist. Rejected.
- **Vector search / RAG:** not needed; structured filters over a small catalogue are deterministic and
  testable. Revisit by ADR if structured retrieval proves insufficient.
- **Queues or background jobs:** a Server Action with a 45 s timeout is within Vercel's limits. Revisit
  if latency or reliability requires it.

## Consequences

**Positive**

- Model output can't reference hidden or invented inventory, can't set prices, and can't touch other
  users' data.
- The whole pipeline is unit-tested deterministically with injected dependencies and a mock model.

**Negative**

- Real-model quality, latency and cost are **unverified** until credentials are available. Live
  integration tests are skipped.
- Generation blocks the request for several seconds; there's no streaming yet.
- Counting from the database allows a small overshoot of the rate limit under concurrent requests.

**Follow-up**

- An evaluation set and live smoke test once a gateway key exists ([AI_EVALUATION](../ai/AI_EVALUATION.md)).
- Streaming progress.
- Provider-specified pricing units, if "per person" proves wrong for some providers.
