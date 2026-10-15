import type { Database } from "@/types/database";

/** Partner listing types and how each is priced (ADR-0008). */
export type ListingType = Database["public"]["Enums"]["listing_type"];
export type PriceUnit = Database["public"]["Enums"]["price_unit"];

export const LISTING_TYPES = [
  "experience",
  "guide",
  "stay",
  "transport",
] as const satisfies readonly ListingType[];

export const LISTING_TYPE_LABELS: Record<ListingType, { one: string; many: string; path: string }> =
  {
    experience: { one: "Experience", many: "Experiences", path: "/experiences" },
    stay: { one: "Stay", many: "Stays", path: "/stays" },
    guide: { one: "Guide", many: "Guides", path: "/guides" },
    transport: { one: "Transport", many: "Transport", path: "/transport" },
  };

/** Price units a partner can choose for each type (the database enforces the same). */
export const PRICE_UNITS_BY_TYPE: Record<ListingType, readonly PriceUnit[]> = {
  experience: ["per_person"],
  guide: ["per_group_day", "per_person_day"],
  stay: ["per_room_night"],
  transport: ["per_vehicle_trip", "per_vehicle_day"],
};

export const PRICE_UNIT_LABELS: Record<PriceUnit, string> = {
  per_person: "per person",
  per_person_day: "per person per day",
  per_group_day: "per group per day",
  per_room_night: "per room per night",
  per_vehicle_trip: "per vehicle per trip",
  per_vehicle_day: "per vehicle per day",
};

/** What `daily_capacity` and `max_guests` mean for each type, for forms and listing pages. */
export const CAPACITY_LABELS: Record<
  Exclude<ListingType, "experience">,
  { units: string; unitOne: string; perUnit: string }
> = {
  stay: { units: "Rooms of this type", unitOne: "room", perUnit: "Guests per room" },
  guide: { units: "Guides available per day", unitOne: "guide", perUnit: "Group size per guide" },
  transport: {
    units: "Vehicles available per day",
    unitOne: "vehicle",
    perUnit: "Seats per vehicle",
  },
};

/**
 * What a partner listed ("2 rooms of this type"), never phrased as live
 * availability: only the partner confirms that.
 */
export function capacityText(type: Exclude<ListingType, "experience">, count: number): string {
  return type === "stay"
    ? `${unitCount(type, count)} of this type`
    : `${unitCount(type, count)} per day`;
}

/** "2 rooms", "1 vehicle". */
export function unitCount(type: Exclude<ListingType, "experience">, count: number): string {
  return `${count} ${CAPACITY_LABELS[type].unitOne}${count === 1 ? "" : "s"}`;
}

/** How many service days a request covers (a stay's nights; inclusive dates). */
export function serviceDays(startsOn: string, endsOn: string | null): number {
  if (!endsOn) return 1;
  const ms = Date.parse(`${endsOn}T00:00:00Z`) - Date.parse(`${startsOn}T00:00:00Z`);
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

/** Mirrors private.estimate_listing_total, for showing the estimate before submitting. */
export function estimateTotalMinor(
  unit: PriceUnit,
  priceMinor: number | null,
  party: number,
  units: number,
  days: number,
): number | null {
  if (priceMinor === null) return null;
  switch (unit) {
    case "per_person":
      return priceMinor * party;
    case "per_person_day":
      return priceMinor * party * days;
    case "per_group_day":
    case "per_room_night":
    case "per_vehicle_day":
      return priceMinor * units * days;
    case "per_vehicle_trip":
      return priceMinor * units;
  }
}
