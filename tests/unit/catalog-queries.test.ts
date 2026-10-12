import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Call = [string, ...unknown[]];
type Result = { data: unknown; error: { code: string } | null; count: number | null };

const state = { calls: [] as Call[][], results: [] as Result[], tables: [] as string[] };

function builder(): Record<string, unknown> {
  const calls: Call[] = [];
  state.calls.push(calls);
  const self: Record<string, unknown> = {};
  for (const method of ["select", "textSearch", "eq", "in", "gte", "lt", "order", "limit"]) {
    self[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return self;
    };
  }
  const settle = () =>
    Promise.resolve(state.results.shift() ?? { data: [], error: null, count: 0 });
  self.range = (...args: unknown[]) => {
    calls.push(["range", ...args]);
    return settle();
  };
  self.maybeSingle = () => settle();
  self.then = (resolve: (r: Result) => unknown) => settle().then(resolve);
  return self;
}

vi.mock("@/lib/supabase/public", () => ({
  createSupabasePublicClient: () => ({
    from: (table: string) => {
      state.tables.push(table);
      return builder();
    },
  }),
}));

const { searchExperiences, searchDestinations, getPublicExperience, getPublicDestination } =
  await import("@/server/catalog/catalog");

beforeEach(() => {
  state.calls = [];
  state.results = [];
  state.tables = [];
});

const methods = (calls: Call[], name: string) =>
  calls.filter((c) => c[0] === name).map((c) => c.slice(1));

describe("searchExperiences", () => {
  it("maps every filter to a bound query clause", async () => {
    await searchExperiences({
      q: "river rafting",
      district: "East Siang",
      category: "adventure",
      budget: "3000-10000",
      duration: "half-day",
      sort: "price-asc",
      page: 2,
    });
    const calls = state.calls[0]!;
    expect(state.tables).toEqual(["experiences"]);
    expect(methods(calls, "textSearch")).toEqual([
      ["search_vector", "river rafting", { type: "websearch", config: "english" }],
    ]);
    expect(methods(calls, "eq")).toEqual([
      ["destination.district", "East Siang"],
      ["category", "adventure"],
    ]);
    expect(methods(calls, "gte")).toEqual([
      ["price_from_minor", 300_000],
      ["duration_minutes", 180],
    ]);
    expect(methods(calls, "lt")).toEqual([
      ["price_from_minor", 1_000_000],
      ["duration_minutes", 360],
    ]);
    expect(methods(calls, "order")).toEqual([
      ["price_from_minor", { ascending: true, nullsFirst: false }],
      ["id", { ascending: true }],
    ]);
    expect(methods(calls, "range")).toEqual([[12, 23]]);
  });

  it("only selects explicit columns with inner joins and an exact count", async () => {
    await searchExperiences({ sort: "newest", page: 1 });
    const [[columns, options]] = methods(state.calls[0]!, "select") as [[string, unknown]];
    expect(columns).not.toContain("*");
    expect(columns).toContain("destinations!inner");
    expect(columns).toContain("providers!inner");
    expect(options).toEqual({ count: "exact" });
    expect(methods(state.calls[0]!, "textSearch")).toEqual([]);
    expect(methods(state.calls[0]!, "order")[0]).toEqual([
      "published_at",
      { ascending: false, nullsFirst: false },
    ]);
  });

  it("uses one-sided ranges for open-ended buckets", async () => {
    await searchExperiences({
      budget: "under-1000",
      duration: "multi-day",
      sort: "newest",
      page: 1,
    });
    const calls = state.calls[0]!;
    expect(methods(calls, "lt")).toEqual([["price_from_minor", 100_000]]);
    expect(methods(calls, "gte")).toEqual([["duration_minutes", 1440]]);
  });

  it("reports an out-of-range page with the real total instead of failing", async () => {
    state.results.push({ data: null, error: { code: "PGRST103" }, count: null });
    state.results.push({ data: [], error: null, count: 17 });
    const page = await searchExperiences({ sort: "newest", page: 9 });
    expect(page).toEqual({ items: [], total: 17, page: 9, pageCount: 2, outOfRange: true });
  });

  it("surfaces other database errors as AppErrors without leaking details", async () => {
    state.results.push({ data: null, error: { code: "XX000" }, count: null });
    await expect(searchExperiences({ sort: "newest", page: 1 })).rejects.toMatchObject({
      code: "INTERNAL",
      message: "Could not load experiences.",
    });
  });
});

describe("searchDestinations", () => {
  it("maps embedded counts and filters", async () => {
    state.results.push({
      data: [
        { id: "d1", slug: "ziro", name: "Ziro", district: "Lower Subansiri", summary: "" },
        { id: "d2", slug: "tawang", name: "Tawang", district: "Tawang", summary: "" },
      ],
      error: null,
      count: 2,
    });
    // Second query: destination ids of visible experiences, tallied in the app.
    state.results.push({
      data: [
        { destination_id: "d1" },
        { destination_id: "d1" },
        { destination_id: "d1" },
        { destination_id: "d1" },
      ],
      error: null,
      count: null,
    });
    const page = await searchDestinations({ q: "valley", district: "Lower Subansiri", page: 1 });
    expect(page.items.map((d) => d.experienceCount)).toEqual([4, 0]);
    expect(page.total).toBe(2);
    expect(state.tables).toEqual(["destinations", "experiences"]);
    expect(methods(state.calls[1]!, "select")).toEqual([["destination_id"]]);
    const calls = state.calls[0]!;
    expect(methods(calls, "eq")).toEqual([["district", "Lower Subansiri"]]);
    expect(methods(calls, "textSearch")[0]?.[1]).toBe("valley");
  });
});

describe("detail lookups", () => {
  it.each(["../etc", "UPPER", "with space", "a".repeat(81), "-leading"])(
    "rejects malformed experience slug %j without querying",
    async (slug) => {
      expect(await getPublicExperience(slug)).toBeNull();
      expect(state.tables).toEqual([]);
    },
  );

  it("returns null for a missing (or hidden) experience", async () => {
    state.results.push({ data: null, error: null, count: null });
    expect(await getPublicExperience("no-such-thing")).toBeNull();
  });

  it("returns null for a missing destination without loading experiences", async () => {
    state.results.push({ data: null, error: null, count: null });
    expect(await getPublicDestination("nowhere")).toBeNull();
    expect(state.tables).toEqual(["destinations"]);
  });
});
