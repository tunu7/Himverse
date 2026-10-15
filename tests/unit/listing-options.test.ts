import { describe, expect, it } from "vitest";

import { estimateTotalMinor, serviceDays } from "@/lib/listing-options";

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
