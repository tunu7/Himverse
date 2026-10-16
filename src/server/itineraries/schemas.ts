import { z } from "zod";

import type { ExperienceCategory } from "@/lib/catalog-options";

/**
 * Structured output requested from the model: schema version itinerary.v3
 * (v2 added an optional stay "S1" and transport leg "T1" per day, v3 a guide
 * "G1"; older plans remain readable because all three are optional).
 *
 * The model references retrieved records ONLY by alias ("E3", "D1"); it never
 * sees or returns database ids, prices or dates. Aliases are resolved and
 * checked server-side (validate.ts), dates come from the preferences and costs
 * from database prices.
 */
export const SCHEMA_VERSION = "itinerary.v3";

export const TIMES_OF_DAY = ["morning", "afternoon", "evening", "full_day"] as const;
export type TimeOfDay = (typeof TIMES_OF_DAY)[number];

export type DraftConstraints = {
  days: number;
  destinations: readonly string[];
  experiences: readonly string[];
  stays?: readonly string[];
  transport?: readonly string[];
  guides?: readonly string[];
};

function draftSchema(constraints?: DraftConstraints) {
  const alias = (pattern: RegExp, allowed: readonly string[] | undefined) =>
    allowed && allowed.length > 0
      ? z.enum(allowed as [string, ...string[]])
      : z.string().regex(pattern);
  // Narrowed to the retrieved aliases; when none were retrieved, only null fits.
  const optionalAlias = (pattern: RegExp, allowed: readonly string[] | undefined) =>
    (allowed === undefined
      ? z.string().regex(pattern)
      : allowed.length > 0
        ? z.enum(allowed as [string, ...string[]])
        : z.never()
    )
      .nullable()
      .optional();
  const maxDay = constraints?.days ?? 14;
  const days = z
    .array(
      z.object({
        day: z.number().int().min(1).max(maxDay),
        base: alias(/^D\d{1,2}$/, constraints?.destinations),
        items: z
          .array(
            z.object({
              experience: alias(/^E\d{1,3}$/, constraints?.experiences),
              timeOfDay: z.enum(TIMES_OF_DAY),
              rationale: z.string().max(300),
            }),
          )
          .max(6),
        note: z.string().max(300).optional(),
        // Where to sleep that night, and how to get to the day's base.
        stay: optionalAlias(/^S\d{1,3}$/, constraints?.stays),
        transport: optionalAlias(/^T\d{1,3}$/, constraints?.transport),
        // A local guide for the day at its base.
        guide: optionalAlias(/^G\d{1,3}$/, constraints?.guides),
      }),
    )
    .min(constraints?.days ?? 1)
    .max(maxDay);
  return z.object({
    title: z.string().trim().min(1).max(80),
    summary: z.string().max(800),
    days,
    cautions: z.array(z.string().max(200)).max(8),
  });
}

export const itineraryDraftSchema = draftSchema();

/**
 * The same schema narrowed to one request: exactly N days and only the
 * retrieved aliases. Sent to the model as its output schema, so providers with
 * constrained decoding (Ollama, most hosted models) can't produce the wrong
 * number of days or an unknown alias. A narrowing of itineraryDraftSchema, so
 * anything it accepts the general schema accepts too; validate.ts still
 * checks every rule.
 */
export function itineraryDraftSchemaFor(constraints: DraftConstraints) {
  return draftSchema(constraints);
}

export type ItineraryDraft = z.infer<typeof itineraryDraftSchema>;

/** A retrieved, publicly visible experience: the only inventory the model may use. */
export type CandidateExperience = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: ExperienceCategory;
  durationMinutes: number;
  priceFromMinor: number | null;
  destinationId: string;
};

export type CandidateDestination = { id: string; slug: string; name: string; district: string };

/** A bookable stay (one room type) at a candidate destination. */
export type CandidateStay = {
  id: string;
  title: string;
  destinationId: string;
  priceFromMinor: number | null;
  /** Guests per room and rooms available per night. */
  maxGuests: number;
  dailyCapacity: number;
};

/** A bookable vehicle: a route (from -> to) or day hire around its destination. */
export type CandidateTransport = {
  id: string;
  title: string;
  destinationId: string;
  routeToDestinationId: string | null;
  priceFromMinor: number | null;
  /** Seats per vehicle and vehicles available per day. */
  maxGuests: number;
  dailyCapacity: number;
};

/** A bookable guide at a candidate destination. */
export type CandidateGuide = {
  id: string;
  title: string;
  destinationId: string;
  priceFromMinor: number | null;
  /** Per group per day, or per person per day (ADR-0008). */
  priceUnit: "per_group_day" | "per_person_day";
  languages: string[];
  /** Group size per guide and guides available per day. */
  maxGuests: number;
  dailyCapacity: number;
};

export type Candidates = {
  experiences: CandidateExperience[];
  destinations: CandidateDestination[];
  stays: CandidateStay[];
  transport: CandidateTransport[];
  guides: CandidateGuide[];
  /** True when interest filters returned too little and retrieval widened to all categories. */
  widened: boolean;
};

/**
 * A validated plan with aliases resolved to database ids. Stored in
 * itinerary_versions.plan and re-parsed with this schema when read back.
 */
export const resolvedPlanSchema = z.object({
  title: z.string().max(80),
  summary: z.string().max(800),
  cautions: z.array(z.string().max(200)).max(8),
  days: z
    .array(
      z.object({
        dayNumber: z.number().int().min(1).max(14),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        destinationId: z.uuid(),
        note: z.string().max(300),
        items: z
          .array(
            z.object({
              experienceId: z.uuid(),
              destinationId: z.uuid(),
              timeOfDay: z.enum(TIMES_OF_DAY),
              rationale: z.string().max(300),
            }),
          )
          .max(6),
        /** The night's stay (rooms computed from travellers); absent in v1 plans. */
        stay: z
          .object({ experienceId: z.uuid(), units: z.number().int().min(1).max(50) })
          .nullable()
          .default(null),
        /** Transport arriving at (or day hire around) the day's base. */
        transport: z
          .object({ experienceId: z.uuid(), units: z.number().int().min(1).max(50) })
          .nullable()
          .default(null),
        /** A guide for the day at its base (guides computed from travellers). */
        guide: z
          .object({ experienceId: z.uuid(), units: z.number().int().min(1).max(50) })
          .nullable()
          .default(null),
      }),
    )
    .min(1)
    .max(14),
});

export type ResolvedPlan = z.infer<typeof resolvedPlanSchema>;
