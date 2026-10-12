# Itinerary Generation

Pipeline design for flows T2/T3 in [USER_FLOWS](../product/USER_FLOWS.md). Not implemented.

## Pipeline

```
validated TripRequest
  → retrieve candidates (published experiences + destinations, filtered by region/season/budget/interests)
  → build prompt (versioned template, candidates as structured data with IDs)
  → model call (structured output, timeout)
  → Zod validate ItineraryDraft
  → grounding + constraint checks
      ├─ pass → persist itinerary version → return
      └─ fail → one repair attempt with specific errors → re-validate → else return partial/failed result
```

## Input (draft shape)

`startDate | travelMonth`, `durationDays (1–30)`, `groupSize (1–20)`, `budgetBand`, `interests[]`,
`pace (relaxed|moderate|packed)`, `constraints` (mobility, diet, altitude), optional free-text note
(length-limited, treated as data).

## Output (draft shape)

```ts
type ItineraryDraft = {
  days: Array<{
    dayNumber: number;
    baseDestinationId: string; // must exist in destinations
    items: Array<{
      experienceId: string; // must exist, be published, provider verified
      timeOfDay: "morning" | "afternoon" | "evening" | "full_day";
      rationale: string; // short, rendered as plain text
    }>;
    travelNotes?: string;
  }>;
  summary: string;
  warnings: string[]; // e.g. "Sela Pass may be snowbound in January"
};
```

## Grounding and constraint checks (deterministic code, unit-tested)

- All IDs exist and are visible to travelers; no duplicates unless allowed.
- Day count equals requested duration; items fit the day given experience durations.
- Seasonality: experience available in the travel month.
- Travel feasibility between destinations (requires a travel-time table — open question for Phase 3).
- Indicative total within budget band (prices from DB, never from model text).

## Refinement

Refinement creates a new version from the previous version + change request, using the same pipeline.
Versions are immutable; the traveler can view and restore earlier versions.

## Presentation

Label as AI-suggested. Show indicative prices from DB. Booking CTAs go through the booking flow, which
checks authoritative availability.
