import { describe, expect, it } from "vitest";

import {
  estimateTotalMinor,
  type ListingSummaryInput,
  listingSummaryParts,
  serviceDays,
} from "@/lib/listing-options";

// Mirrors private.estimate_listing_total (pgTAP covers the database side).
describe("estimateTotalMinor", () => {
  it.each([
    ["per_person", 100_000, 3, 1, 1, 300_000],
    ["per_person_day", 50_000, 3, 1, 2, 300_000],
    ["per_group_day", 200_000, 4, 1, 3, 600_000],
    ["per_room_night", 300_000, 3, 2, 2, 1_200_000],
    ["per_vehicle_trip", 900_000, 6, 1, 1, 900_000],
    ["per_vehicle_day", 400_000, 6, 2, 3, 2_400_000],
  ] as const)("%s", (unit, price, party, units, days, total) => {
    expect(estimateTotalMinor(unit, price, party, units, days)).toBe(total);
  });

  it("is null when the listing is unpriced", () => {
    expect(estimateTotalMinor("per_room_night", null, 2, 1, 2)).toBeNull();
  });
});

describe("serviceDays", () => {
  it("counts inclusive days", () => {
    expect(serviceDays("2026-11-01", null)).toBe(1);
    expect(serviceDays("2026-11-01", "2026-11-01")).toBe(1);
    expect(serviceDays("2026-10-31", "2026-11-02")).toBe(3);
  });
});

describe("listingSummaryParts", () => {
  const base: ListingSummaryInput = {
    listingType: "experience",
    priceUnit: "per_person",
    priceFromMinor: 150_000,
    durationMinutes: 120,
    dailyCapacity: null,
    languages: [],
    destinationName: "Ziro Valley",
    routeToName: null,
  };

  it("describes each type in its own terms", () => {
    expect(listingSummaryParts(base)).toEqual(["Ziro Valley", "2 h", "from ₹1,500 per person"]);
    expect(
      listingSummaryParts({
        ...base,
        listingType: "stay",
        priceUnit: "per_room_night",
        priceFromMinor: 250_000,
        dailyCapacity: 2,
      }),
    ).toEqual(["Ziro Valley", "2 rooms of this type", "₹2,500 per room per night"]);
    expect(
      listingSummaryParts({
        ...base,
        listingType: "guide",
        priceUnit: "per_group_day",
        dailyCapacity: 1,
        languages: ["English", "Adi"],
      }),
    ).toEqual(["Ziro Valley", "1 guide per day", "English, Adi", "₹1,500 per group per day"]);
    expect(
      listingSummaryParts({
        ...base,
        listingType: "transport",
        priceUnit: "per_vehicle_trip",
        priceFromMinor: null,
        dailyCapacity: 3,
        destinationName: "Pasighat",
        routeToName: "Ziro Valley",
      }),
    ).toEqual(["Pasighat → Ziro Valley", "3 vehicles per day"]);
  });

  it("says when the destination isn't published", () => {
    expect(listingSummaryParts({ ...base, destinationName: null, priceFromMinor: null })).toEqual([
      "destination not published",
      "2 h",
    ]);
  });
});
