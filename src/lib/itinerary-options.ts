/**
 * Itinerary limits and pace definitions shared by server validation
 * (src/server/itineraries) and client forms. Pure constants only.
 */
export const MAX_TRIP_DAYS = 14;
export const MAX_TRAVELERS = 12;
export const MAX_NOTES_LENGTH = 500;
export const MAX_START_DAYS_AHEAD = 730;
export const TRIP_TIME_ZONE = "Asia/Kolkata";

export const PACES = {
  relaxed: { label: "Relaxed", dailyCapacityMinutes: 6 * 60 },
  moderate: { label: "Moderate", dailyCapacityMinutes: 9 * 60 },
  packed: { label: "Packed", dailyCapacityMinutes: 11 * 60 },
} as const;
export type Pace = keyof typeof PACES;
