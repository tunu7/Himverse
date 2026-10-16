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
      ["listing_type", "experience"],
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
      ["listing_type", "experience"],
      ["destination.slug", "ziro"],
    ]);
  });

  it("widens to all categories when interests can't fill the trip, and says so", async () => {
    state.results.push([row(1)]);
    state.results.push([row(1), row(2), row(3)]);
    const result = await retrieveCandidates(
      prefs({
        interests: ["wildlife"],
        durationDays: 3,
        includeStays: false,
        includeTransport: false,
        includeGuide: false,
      }),
    );
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

  it("adds bookable stays and transport at the candidate destinations that fit the group", async () => {
    state.results.push([row(1, 1), row(2, 2)]);
    const listing = (id: string, fields: Record<string, unknown>) => ({
      id,
      title: id,
      destination_id: "d1",
      price_from_minor: 1000,
      max_guests: 2,
      daily_capacity: 2,
      ...fields,
    });
    state.results.push([
      listing("room", {}),
      listing("tiny", { max_guests: 1, daily_capacity: 2 }), // 2 places for 3 travellers
    ]);
    state.results.push([
      listing("route", { route_to_destination_id: "d2" }),
      listing("hire", { route_to_destination_id: null }),
      listing("elsewhere", { route_to_destination_id: "d9" }), // not a candidate destination
    ]);
    const result = await retrieveCandidates(prefs({ adults: 2, children: 1 }));

    const [, stays, transport] = state.calls;
    for (const [calls, type] of [
      [stays!, "stay"],
      [transport!, "transport"],
    ] as const) {
      expect(by(calls, "eq")).toEqual([
        ["listing_type", type],
        ["accepts_bookings", true],
      ]);
      expect(by(calls, "in")).toEqual([["destination_id", ["d1", "d2"]]]);
    }
    expect(result.stays.map((s) => s.id)).toEqual(["room"]);
    expect(result.transport.map((t) => t.id)).toEqual(["route", "hire"]);
    expect(result.transport[0]).toMatchObject({ destinationId: "d1", routeToDestinationId: "d2" });
  });

  it("offers bookable guides who fit the group and speak the asked language", async () => {
    state.results.push([row(1, 1)]);
    const guide = (id: string, fields: Record<string, unknown>) => ({
      id,
      title: id,
      destination_id: "d1",
      price_from_minor: 1000,
      price_unit: "per_group_day",
      languages: ["English", "Hindi"],
      max_guests: 4,
      daily_capacity: 1,
      ...fields,
    });
    state.results.push([
      guide("fits", {}),
      guide("small", { max_guests: 2 }), // 2 places for 3 travellers
      guide("other-language", { languages: ["Apatani"] }),
    ]);
    const result = await retrieveCandidates(
      prefs({ adults: 3, includeStays: false, includeTransport: false, guideLanguage: "hindi" }),
    );
    expect(by(state.calls[1]!, "eq")).toEqual([
      ["listing_type", "guide"],
      ["accepts_bookings", true],
    ]);
    expect(result.guides.map((g) => g.id)).toEqual(["fits"]);
  });

  it("skips stays and transport when the traveller turns them off", async () => {
    state.results.push([row(1)]);
    const result = await retrieveCandidates(
      prefs({ durationDays: 1, includeStays: false, includeTransport: false, includeGuide: false }),
    );
    expect(state.calls).toHaveLength(1);
    expect(result).toMatchObject({ stays: [], transport: [] });
  });

  it("returns nothing when nothing is published", async () => {
    expect(await retrieveCandidates(prefs())).toEqual({
      experiences: [],
      destinations: [],
      stays: [],
      transport: [],
      guides: [],
      widened: false,
    });
  });
});
