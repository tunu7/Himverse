import { z } from "zod";

import { AppError } from "@/lib/errors";
import { type Pace, PACES } from "@/lib/itinerary-options";
import { type TripPreferences, tripPreferencesSchema } from "@/server/itineraries/preferences";

// Form parsing for itinerary actions. Preferences are always re-validated with
// the server schema (tripPreferencesSchema); this layer only maps form fields.

const optionalInt = (value: FormDataEntryValue | null) => {
  if (value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : Number.NaN;
};

/** Field names in the form differ from the domain for money (rupees vs paise) and place. */
const FIELD_ALIASES: Record<string, string> = {
  budgetMaxMinor: "budgetRupees",
  destinationSlug: "place",
  district: "place",
};

function toValidationError(error: z.ZodError): AppError {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    const field = FIELD_ALIASES[key] ?? key;
    (fieldErrors[field] ??= []).push(issue.message);
  }
  return new AppError("VALIDATION_FAILED", "Please check the highlighted fields.", { fieldErrors });
}

/** `place` is "", "district:<name>" or "destination:<slug>". */
function placeFields(place: string): Pick<TripPreferences, "district" | "destinationSlug"> {
  if (place.startsWith("district:")) return { district: place.slice("district:".length) };
  if (place.startsWith("destination:"))
    return { destinationSlug: place.slice("destination:".length) };
  return {};
}

export function preferencesFromForm(formData: FormData, now: Date): TripPreferences {
  const budgetRupees = optionalInt(formData.get("budgetRupees"));
  const result = tripPreferencesSchema(now).safeParse({
    origin: String(formData.get("origin") ?? ""),
    ...placeFields(String(formData.get("place") ?? "")),
    startDate: String(formData.get("startDate") ?? ""),
    durationDays: optionalInt(formData.get("durationDays")),
    adults: optionalInt(formData.get("adults")),
    children: optionalInt(formData.get("children")) ?? 0,
    budgetMaxMinor: budgetRupees === undefined ? undefined : Math.round(budgetRupees * 100),
    currency: String(formData.get("currency") ?? "INR"),
    interests: formData.getAll("interests").map(String),
    pace: String(formData.get("pace") ?? "moderate"),
    limitedMobility: formData.get("limitedMobility") === "on",
    notes: String(formData.get("notes") ?? ""),
  });
  if (!result.success) throw toValidationError(result.error);
  return result.data;
}

const paceSchema = z.enum(Object.keys(PACES) as [Pace, ...Pace[]]);

export const itineraryIdSchema = z.strictObject({ itineraryId: z.uuid() });

export const refineSchema = z.strictObject({
  itineraryId: z.uuid(),
  request: z.string().trim().min(3, "Tell us what to change.").max(500),
  pace: z.union([z.literal(""), paceSchema]).optional(),
  budgetRupees: z.union([z.literal(""), z.coerce.number().int().min(0).max(10_000_000)]).optional(),
});

export const setVersionSchema = z.strictObject({
  itineraryId: z.uuid(),
  version: z.coerce.number().int().min(1).max(1000),
});

/**
 * Applies refinement overrides to stored preferences and re-validates them as a
 * new request (so a trip whose dates have passed can't be refined).
 */
export function refinedPreferences(
  stored: TripPreferences,
  overrides: { pace?: Pace | ""; budgetRupees?: number | "" },
  now: Date,
): TripPreferences {
  const result = tripPreferencesSchema(now).safeParse({
    ...stored,
    ...(overrides.pace ? { pace: overrides.pace } : {}),
    ...(typeof overrides.budgetRupees === "number"
      ? { budgetMaxMinor: overrides.budgetRupees * 100 }
      : {}),
  });
  if (!result.success) {
    if (result.error.issues.some((i) => i.path[0] === "startDate")) {
      throw new AppError(
        "VALIDATION_FAILED",
        "This trip's dates have passed. Create a new itinerary instead.",
      );
    }
    throw toValidationError(result.error);
  }
  return result.data;
}
