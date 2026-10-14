import { beforeEach, describe, expect, it, vi } from "vitest";

import { prefs } from "./itinerary-fixtures";

vi.mock("server-only", () => ({}));

type Call = [string, ...unknown[]];
const state = { calls: [] as Call[][], results: [] as unknown[][] };

vi.mock("@/lib/supabase/public", () => ({
  createSupabasePublicClient: () => ({
    from: () => {
      const calls: Call[] = [];
      state.calls.push(calls);
      const self: Record<string, unknown> = {};
      for (const m of ["select", "lte", "eq", "in", "or", "order"]) {
        self[m] = (...args: unknown[]) => {
          calls.push([m, ...args]);
          return self;
        };
      }
      self.limit = (...args: unknown[]) => {
        calls.push(["limit", ...args]);
        return Promise.resolve({ data: state.results.shift() ?? [], error: null });
      };
      return self;
    },
  }),
}));

const { retrieveCandidates, MAX_CANDIDATE_DESTINATIONS } =
  await import("@/server/itineraries/retrieval");

const row = (n: number, destination = 1) => ({
  id: `e${n}`,
  slug: `e-${n}`,
  title: `Experience ${n}`,
  summary: "s".repeat(500),
  category: "culture",
  duration_minutes: 120,
  price_from_minor: 1000,
  destination_id: `d${destination}`,
  destination: {
    id: `d${destination}`,
    slug: `d-${destination}`,
    name: `Dest ${destination}`,
    district: "Tawang",
  },
});

const by = (calls: Call[], name: string) =>
  calls.filter((c) => c[0] === name).map((c) => c.slice(1));

beforeEach(() => {
  state.calls = [];
  state.results = [];
});

describe("retrieveCandidates", () => {
  it("applies region, interest, trip-length and budget filters", async () => {
    state.results.push([row(1), row(2), row(3)]);
    const result = await retrieveCandidates(
      prefs({
        district: "Tawang",
        interests: ["culture"],
        durationDays: 2,
        adults: 2,
        children: 1,
        budgetMaxMinor: 30_000,
      }),
    );
    const calls = state.calls[0]!;
    // Only experiences whose provider accepts bookings, so every plan is bookable.
    expect(by(calls, "eq")).toEqual([
      ["accepts_bookings", true],
      ["destination.district", "Tawang"],
    ]);
    expect(by(calls, "in")).toEqual([["category", ["culture"]]]);
    expect(by(calls, "lte")).toEqual([["duration_minutes", 2880]]);
    // floor(30000 / 3 travellers): a server-computed integer, never user text.
    expect(by(calls, "or")).toEqual([["price_from_minor.is.null,price_from_minor.lte.10000"]]);
    expect(result.widened).toBe(false);
    expect(result.experiences[0]?.summary).toHaveLength(200);
  });

  it("prefers an exact destination over a district", async () => {
    await retrieveCandidates(prefs({ destinationSlug: "ziro", district: "Tawang" }));
    expect(by(state.calls[0]!, "eq")).toEqual([
      ["accepts_bookings", true],
      ["destination.slug", "ziro"],
    ]);
  });

  it("widens to all categories when interests can't fill the trip, and says so", async () => {
    state.results.push([row(1)]);
    state.results.push([row(1), row(2), row(3)]);
    const result = await retrieveCandidates(prefs({ interests: ["wildlife"], durationDays: 3 }));
    expect(state.calls).toHaveLength(2);
    expect(by(state.calls[1]!, "in")).toEqual([]);
    expect(result.widened).toBe(true);
    expect(result.experiences).toHaveLength(3);
  });

  it("caps the number of destinations offered to the model", async () => {
    state.results.push(Array.from({ length: 15 }, (_, i) => row(i, i)));
    const result = await retrieveCandidates(prefs());
    expect(result.destinations).toHaveLength(MAX_CANDIDATE_DESTINATIONS);
    expect(new Set(result.experiences.map((e) => e.destinationId)).size).toBe(
      MAX_CANDIDATE_DESTINATIONS,
    );
  });

  it("returns nothing when nothing is published", async () => {
    expect(await retrieveCandidates(prefs())).toEqual({
      experiences: [],
      destinations: [],
      widened: false,
    });
  });
});
