import { z } from "zod";

import type { ExperienceCategory } from "@/lib/catalog-options";

/**
 * Structured output requested from the model: schema version itinerary.v1.
 *
 * The model references retrieved records ONLY by alias ("E3", "D1"); it never
 * sees or returns database ids, prices or dates. Aliases are resolved and
 * checked server-side (validate.ts), dates come from the preferences and costs
 * from database prices.
 */
export const SCHEMA_VERSION = "itinerary.v1";

export const TIMES_OF_DAY = ["morning", "afternoon", "evening", "full_day"] as const;
export type TimeOfDay = (typeof TIMES_OF_DAY)[number];

export const itineraryDraftSchema = z.object({
  title: z.string().trim().min(1).max(80),
  summary: z.string().max(800),
  days: z
    .array(
      z.object({
        day: z.number().int().min(1).max(14),
        base: z.string().regex(/^D\d{1,2}$/),
        items: z
          .array(
            z.object({
              experience: z.string().regex(/^E\d{1,3}$/),
              timeOfDay: z.enum(TIMES_OF_DAY),
              rationale: z.string().max(300),
            }),
          )
          .max(6),
        note: z.string().max(300).optional(),
      }),
    )
    .min(1)
    .max(14),
  cautions: z.array(z.string().max(200)).max(8),
});

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

export type Candidates = {
  experiences: CandidateExperience[];
  destinations: CandidateDestination[];
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
      }),
    )
    .min(1)
    .max(14),
});

export type ResolvedPlan = z.infer<typeof resolvedPlanSchema>;
