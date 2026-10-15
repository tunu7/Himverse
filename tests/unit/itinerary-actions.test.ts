import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/errors";

import { prefs } from "./itinerary-fixtures";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
const redirect = vi.fn();
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));

const fns = {
  requireAccount: vi.fn<(types: readonly string[]) => Promise<{ id: string; email: null }>>(
    async () => ({
      id: "u1",
      email: null,
    }),
  ),
  generate: vi.fn(),
  getMyItinerary: vi.fn(),
  setCurrentVersion: vi.fn(),
  deleteItinerary: vi.fn(),
};
vi.mock("@/server/auth/session", () => ({
  requireAccount: (types: readonly string[]) => fns.requireAccount(types),
}));
vi.mock("@/server/itineraries/service", () => ({
  generateItineraryForCurrentUser: (...a: unknown[]) => fns.generate(...a),
}));
vi.mock("@/server/itineraries/repository", () => ({
  getMyItinerary: (...a: unknown[]) => fns.getMyItinerary(...a),
  setCurrentVersion: (...a: unknown[]) => fns.setCurrentVersion(...a),
  deleteItinerary: (...a: unknown[]) => fns.deleteItinerary(...a),
}));

const actions = await import("@/features/itineraries/actions");

const ID = "5eed0000-0000-4000-8000-000000000001";
const form = (entries: Record<string, string | string[]>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries))
    for (const value of [v].flat()) data.append(k, value);
  return data;
};
const futureDate = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 30);
  return d.toISOString().slice(0, 10);
};

beforeEach(() => {
  for (const fn of Object.values(fns)) fn.mockReset();
  fns.requireAccount.mockResolvedValue({ id: "u1", email: null });
  redirect.mockReset();
});

describe("account types (ADR-0007)", () => {
  it("only traveller accounts plan trips; others are refused before any generation", async () => {
    fns.requireAccount.mockRejectedValueOnce(
      new AppError("FORBIDDEN", "This isn't available to partner accounts."),
    );
    const result = await actions.createItinerary(null, form({ startDate: futureDate() }));
    expect(fns.requireAccount).toHaveBeenCalledWith(["traveller"]);
    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(fns.generate).not.toHaveBeenCalled();
  });
});

describe("createItinerary", () => {
  it("validates preferences on the server before any generation", async () => {
    const result = await actions.createItinerary(
      null,
      form({
        startDate: "2001-01-01",
        durationDays: "99",
        adults: "0",
        currency: "USD",
        interests: ["casino"],
      }),
    );
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    if (result && !result.ok) {
      expect(Object.keys(result.error.fieldErrors ?? {})).toEqual(
        expect.arrayContaining(["startDate", "durationDays", "adults", "currency", "interests"]),
      );
    }
    expect(fns.generate).not.toHaveBeenCalled();
  });

  it("maps form fields (place, rupees, checkboxes) and redirects to the new itinerary", async () => {
    fns.generate.mockResolvedValue({ itineraryId: ID });
    await actions.createItinerary(
      null,
      form({
        place: "district:Lower Subansiri",
        startDate: futureDate(),
        durationDays: "3",
        adults: "2",
        budgetRupees: "5000",
        currency: "INR",
        interests: ["culture", "food_and_drink"],
        limitedMobility: "on",
      }),
    );
    expect(fns.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "generate",
        itineraryId: null,
        prefs: expect.objectContaining({
          district: "Lower Subansiri",
          budgetMaxMinor: 500_000,
          interests: ["culture", "food_and_drink"],
          limitedMobility: true,
        }),
      }),
    );
    expect(redirect).toHaveBeenCalledWith(`/itineraries/${ID}`);
  });

  it("surfaces pipeline errors safely", async () => {
    fns.generate.mockRejectedValue(new AppError("RATE_LIMITED", "Limit reached."));
    const result = await actions.createItinerary(
      null,
      form({ startDate: futureDate(), durationDays: "2", adults: "1", currency: "INR" }),
    );
    expect(result).toEqual({
      ok: false,
      error: { code: "RATE_LIMITED", message: "Limit reached." },
    });
  });
});

describe("refine and regenerate", () => {
  it("refuse itineraries the caller doesn't own (lookup returns nothing)", async () => {
    fns.getMyItinerary.mockResolvedValue(null);
    const refine = await actions.refineItinerary(
      null,
      form({ itineraryId: ID, request: "More food" }),
    );
    const regen = await actions.regenerateItinerary(null, form({ itineraryId: ID }));
    expect(refine).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(regen).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(fns.generate).not.toHaveBeenCalled();
  });

  it("refuses to refine a trip whose dates have passed", async () => {
    fns.getMyItinerary.mockResolvedValue({
      id: ID,
      version: {
        preferences: prefs({ startDate: "2020-01-01" }),
        plan: { title: "", summary: "", cautions: [], days: [] },
      },
    });
    const result = await actions.refineItinerary(
      null,
      form({ itineraryId: ID, request: "More food" }),
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED", message: expect.stringMatching(/dates have passed/) },
    });
  });

  it("rejects tampered input before any lookup", async () => {
    const result = await actions.refineItinerary(
      null,
      form({ itineraryId: "not-a-uuid", request: "x", owner_id: "u2" }),
    );
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(fns.getMyItinerary).not.toHaveBeenCalled();
  });
});

describe("version and delete actions", () => {
  it("validate ids and pass ownership failures through", async () => {
    expect(
      await actions.makeVersionCurrent(null, form({ itineraryId: ID, version: "0" })),
    ).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED" },
    });
    fns.setCurrentVersion.mockRejectedValue(
      new AppError("NOT_FOUND", "We couldn't find that version."),
    );
    expect(
      await actions.makeVersionCurrent(null, form({ itineraryId: ID, version: "2" })),
    ).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    fns.deleteItinerary.mockRejectedValue(
      new AppError("NOT_FOUND", "We couldn't find that itinerary."),
    );
    expect(await actions.removeItinerary(null, form({ itineraryId: ID }))).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    expect(redirect).not.toHaveBeenCalled();
  });
});
