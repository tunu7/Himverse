# Itinerary Generation

Implemented in Phase 3 for flows T2 and T3 in [USER_FLOWS](../product/USER_FLOWS.md). Decision record:
[ADR-0003](../decisions/ADR-0003-AI-ITINERARY-GENERATION.md).

## Pipeline (`src/server/itineraries/pipeline.ts`)

```
preferences (Zod, server-side) → kill switch → retrieve (deterministic, public only)
  → none? stop with "no suitable inventory" (no model call, nothing invented, no quota used)
  → reserve: begin_itinerary_generation (per-user 10/h + 30/day and platform daily cap, atomic)
  → prompt (itinerary-v1: aliases only, notes fenced) → model (45 s timeout, capped tokens)
  → schema check (itinerary.v1) → grounding + constraint checks
      ├─ pass → save_itinerary_version RPC (consumes the reservation, re-checks visibility +
      │         ownership, DB snapshots) → finish_itinerary_generation
      └─ fail → one repair attempt with the specific errors → re-check → else fail, nothing saved
```

| Module           | Responsibility                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------- |
| `preferences.ts` | Trip preference schema (dates in IST, 1–14 days, 1–12 travellers, INR only, notes ≤ 500) |
| `retrieval.ts`   | Candidate experiences and destinations through the anonymous client; capped at 40 and 10 |
| `prompt.ts`      | Versioned system and user prompt, alias maps, repair prompt, size cap                    |
| `schemas.ts`     | `itinerary.v1` model output schema; stored plan schema                                   |
| `validate.ts`    | Deterministic grounding, date, capacity, multi-day and budget checks; cost estimate      |
| `model/`         | `ItineraryModel` interface, AI Gateway adapter, deterministic mock, factory              |
| `repository.ts`  | RPC calls, owner-scoped reads, current-version changes, delete                           |
| `service.ts`     | Wires real dependencies into the pipeline                                                |

## Input

`place` (anywhere, a district or a destination), `startDate`, `durationDays`, `adults`, `children`,
optional `budget` (₹, total for experiences), `currency` (INR), `interests` (categories), `pace`
(relaxed 6 h, moderate 9 h or packed 11 h of activities per day), `limitedMobility`, optional `origin`,
optional `notes`.

## Model output (`itinerary.v1`)

```ts
{
  title: string;            // ≤ 80
  summary: string;          // ≤ 800
  days: Array<{
    day: number;            // 1..N, each exactly once
    base: "D1" | "D2" | …;  // destination alias from the request
    items: Array<{ experience: "E1" | …; timeOfDay: "morning" | "afternoon" | "evening" | "full_day"; rationale: string }>;
    note?: string;
  }>;
  cautions: string[];       // things the traveller should check; never stated as facts
}
```

The model never sees or returns database IDs, prices or dates.

## Checks (deterministic, unit-tested)

- Every alias exists in the retrieved set. Hallucinated aliases or IDs are rejected.
- Exactly N days numbered 1..N. Dates are computed from the start date, not taken from the model.
- Every item is at the day's base destination, and no experience appears twice.
- Each day's activity minutes stay within the pace's capacity.
- A multi-day experience (≥ 24 h) is alone on its first day, its covered days stay empty, and it fits
  before the trip ends.
- **Budget:** the sum of per-person database prices × travellers must be ≤ the budget. Unpriced items
  are excluded and flagged.
- The save RPC re-checks that every experience is publicly visible now and at the stated destination,
  and snapshots title, price and duration from the database.

## Refinement and versions

- **Refine** takes a change request (≤ 500 characters), with optional pace and budget changes. It
  re-retrieves, re-expresses the previous plan in fresh aliases (dropping anything no longer
  available), and runs the same pipeline.
- **Regenerate** re-runs the pipeline with the stored preferences.
- **Every success is a new, immutable version.** The owner can view any version, make it current, or
  delete the itinerary. A trip whose dates have passed can't be refined.

## Presentation

- A fixed notice says the plan is AI-suggested and not a booking, and that availability, travel times
  and permits (including Inner Line Permits) are unverified.
- Prices are shown as indicative "from" prices per person. Items that have since been hidden show as
  "no longer available".
- Model text is rendered as plain text.

## Not yet done

- Seasonality and travel-time data (no schema).
- Streaming progress.
- Live-model evaluation (needs credentials; see [AI_EVALUATION](AI_EVALUATION.md)).
