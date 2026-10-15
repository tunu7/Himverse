import type { TripPreferences } from "@/server/itineraries/preferences";
import type { Candidates } from "@/server/itineraries/schemas";

export const NOW = new Date("2026-10-12T06:00:00Z"); // 11:30 IST

export const D1 = "20000000-0000-4000-8000-000000000001";
export const D2 = "20000000-0000-4000-8000-000000000002";
export const E = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const candidates: Candidates = {
  widened: false,
  destinations: [
    { id: D1, slug: "ziro", name: "Ziro Valley", district: "Lower Subansiri" },
    { id: D2, slug: "tawang", name: "Tawang", district: "Tawang" },
  ],
  experiences: [
    {
      id: E(1),
      slug: "walk",
      title: "Village walk",
      summary: "",
      category: "culture",
      durationMinutes: 180,
      priceFromMinor: 100_000,
      destinationId: D1,
    },
    {
      id: E(2),
      slug: "trek",
      title: "Pine trek",
      summary: "",
      category: "trekking",
      durationMinutes: 300,
      priceFromMinor: 150_000,
      destinationId: D1,
    },
    {
      id: E(3),
      slug: "food",
      title: "Food trail",
      summary: "",
      category: "food_and_drink",
      durationMinutes: 120,
      priceFromMinor: null,
      destinationId: D1,
    },
    {
      id: E(4),
      slug: "monastery",
      title: "Monastery morning",
      summary: "",
      category: "culture",
      durationMinutes: 150,
      priceFromMinor: 50_000,
      destinationId: D2,
    },
    {
      id: E(5),
      slug: "camp",
      title: "Two-day camp",
      summary: "",
      category: "trekking",
      durationMinutes: 2880,
      priceFromMinor: 900_000,
      destinationId: D2,
    },
  ],
  stays: [],
  transport: [],
};

export const S = (n: number) => `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** The same inventory plus a stay at each destination and a vehicle between them. */
export const withStaysAndTransport: Candidates = {
  ...candidates,
  stays: [
    {
      id: S(1),
      title: "Ziro homestay room",
      destinationId: D1,
      priceFromMinor: 200_000,
      maxGuests: 2,
      dailyCapacity: 3,
    },
    {
      id: S(2),
      title: "Tawang guesthouse room",
      destinationId: D2,
      priceFromMinor: null,
      maxGuests: 3,
      dailyCapacity: 1,
    },
  ],
  transport: [
    {
      id: S(3),
      title: "Ziro to Tawang SUV",
      destinationId: D1,
      routeToDestinationId: D2,
      priceFromMinor: 1_200_000,
      maxGuests: 4,
      dailyCapacity: 2,
    },
    {
      id: S(4),
      title: "Tawang day taxi",
      destinationId: D2,
      routeToDestinationId: null,
      priceFromMinor: 300_000,
      maxGuests: 4,
      dailyCapacity: 1,
    },
  ],
};

export function prefs(overrides: Partial<TripPreferences> = {}): TripPreferences {
  return {
    origin: "",
    startDate: "2026-11-01",
    durationDays: 2,
    adults: 2,
    children: 0,
    currency: "INR",
    interests: [],
    pace: "moderate",
    limitedMobility: false,
    includeStays: true,
    includeTransport: true,
    notes: "",
    ...overrides,
  };
}
