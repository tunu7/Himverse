import { z } from "zod";

import { EXPERIENCE_CATEGORIES } from "@/lib/catalog-options";
import {
  MAX_NOTES_LENGTH,
  MAX_START_DAYS_AHEAD,
  MAX_TRAVELERS,
  MAX_TRIP_DAYS,
  type Pace,
  PACES,
  TRIP_TIME_ZONE,
} from "@/lib/itinerary-options";

/**
 * Trip preferences, validated on the server before any retrieval or model call.
 * Dates are calendar dates in India Standard Time (the only market for now).
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" for `now` in the trip time zone. */
export function todayInTripZone(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TRIP_TIME_ZONE }).format(now);
}

/** Adds whole days to an ISO date (calendar arithmetic, no time zones). */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isRealDate(isoDate: string): boolean {
  if (!ISO_DATE.test(isoDate)) return false;
  const date = new Date(`${isoDate}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === isoDate;
}

const slug = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  .max(60);
const district = z
  .string()
  .trim()
  .regex(/^[A-Za-z][A-Za-z .'-]{1,79}$/);

function preferencesSchema(startDate: z.ZodType<string>) {
  return z
    .strictObject({
      origin: z.string().trim().max(100).default(""),
      destinationSlug: slug.optional(),
      district: district.optional(),
      startDate,
      durationDays: z.number().int().min(1).max(MAX_TRIP_DAYS),
      adults: z.number().int().min(1).max(MAX_TRAVELERS),
      children: z
        .number()
        .int()
        .min(0)
        .max(MAX_TRAVELERS - 1)
        .default(0),
      budgetMaxMinor: z.number().int().min(0).max(1_000_000_000).optional(),
      currency: z.literal("INR", { error: "Only Indian rupees (INR) are supported for now." }),
      interests: z
        .array(z.enum(EXPERIENCE_CATEGORIES))
        .max(EXPERIENCE_CATEGORIES.length)
        .default([]),
      pace: z.enum(Object.keys(PACES) as [Pace, ...Pace[]]).default("moderate"),
      limitedMobility: z.boolean().default(false),
      // Phase 3b: let the planner add a stay each night and transport between places.
      includeStays: z.boolean().default(true),
      includeTransport: z.boolean().default(true),
      // Guides (owner decision 2026-10-16): suggested by default, optionally by language.
      // Default false so plans saved before guides existed don't gain them on refine;
      // the trip form always sends the checkbox (on by default there).
      includeGuide: z.boolean().default(false),
      guideLanguage: z
        .string()
        .trim()
        .max(30)
        .regex(/^[\p{L} ]*$/u, "Letters only, for example Hindi.")
        .default(""),
      notes: z.string().trim().max(MAX_NOTES_LENGTH).default(""),
    })
    .refine((p) => p.adults + p.children <= MAX_TRAVELERS, {
      path: ["children"],
      message: `At most ${MAX_TRAVELERS} travelers in total.`,
    })
    .transform((p) => ({ ...p, interests: [...new Set(p.interests)] }));
}

/** New preferences: the trip must start between today and two years ahead. */
export function tripPreferencesSchema(now: Date) {
  const today = todayInTripZone(now);
  const latestStart = addDays(today, MAX_START_DAYS_AHEAD);
  return preferencesSchema(
    z
      .string()
      .refine(isRealDate, "Enter a valid date.")
      .refine((d) => d >= today, "The trip can't start in the past.")
      .refine((d) => d <= latestStart, "Choose a start date within the next two years."),
  );
}

/** Preferences read back from a saved version: same shape, no date-window rules. */
export const storedPreferencesSchema = preferencesSchema(z.string().refine(isRealDate));

export type TripPreferences = z.infer<ReturnType<typeof tripPreferencesSchema>>;

export function travelerCount(p: Pick<TripPreferences, "adults" | "children">): number {
  return p.adults + p.children;
}

/** Calendar date of a 1-based trip day. */
export function dateOfDay(p: Pick<TripPreferences, "startDate">, dayNumber: number): string {
  return addDays(p.startDate, dayNumber - 1);
}
