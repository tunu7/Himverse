import { describe, expect, it } from "vitest";

import { formatDuration, formatPriceFrom } from "@/lib/format";

describe("formatPriceFrom", () => {
  it("formats paise as whole rupees", () => {
    expect(formatPriceFrom(150000)).toBe("₹1,500");
    expect(formatPriceFrom(0)).toBe("₹0");
    expect(formatPriceFrom(null)).toBeNull();
  });
});

describe("formatDuration", () => {
  it.each([
    [45, "45 min"],
    [120, "2 h"],
    [90, "1 h 30 min"],
    [1440, "1 day"],
    [2880, "2 days"],
    [1500, "25 h"],
  ])("%i minutes -> %s", (minutes, expected) => {
    expect(formatDuration(minutes)).toBe(expected);
  });
});
