"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { type ActionResult, AppError, ok, toLoggedFailure } from "@/lib/errors";
import { parseInput } from "@/lib/validation";
import { requireUser } from "@/server/auth/session";
import {
  deleteItinerary,
  getMyItinerary,
  setCurrentVersion,
} from "@/server/itineraries/repository";
import { generateItineraryForCurrentUser } from "@/server/itineraries/service";

import {
  itineraryIdSchema,
  preferencesFromForm,
  refinedPreferences,
  refineSchema,
  setVersionSchema,
} from "./schemas";

// Each action validates input, requires a signed-in user, and relies on RLS +
// ownership-checking RPCs for authorization (ADR-0003). AI output never decides
// which rows are touched: ids come from the URL/session and server-side lookups.

export type ItineraryActionResult = ActionResult<{ done: true }> | null;

export async function createItinerary(
  _prev: ItineraryActionResult,
  formData: FormData,
): Promise<ItineraryActionResult> {
  let itineraryId: string;
  try {
    await requireUser();
    const prefs = preferencesFromForm(formData, new Date());
    const saved = await generateItineraryForCurrentUser({
      prefs,
      kind: "generate",
      itineraryId: null,
    });
    itineraryId = saved.itineraryId;
  } catch (error) {
    return toLoggedFailure("itineraries.create_failed", error);
  }
  redirect(`/itineraries/${itineraryId}`);
}

async function loadOwned(itineraryId: string) {
  const itinerary = await getMyItinerary(itineraryId);
  if (!itinerary) throw new AppError("NOT_FOUND", "We couldn't find that itinerary.");
  if (!itinerary.version.preferences) {
    throw new AppError(
      "CONFLICT",
      "This itinerary's preferences can't be reused. Create a new itinerary instead.",
    );
  }
  return { itinerary, preferences: itinerary.version.preferences };
}

export async function refineItinerary(
  _prev: ItineraryActionResult,
  formData: FormData,
): Promise<ItineraryActionResult> {
  try {
    const input = parseInput(refineSchema, formData);
    const { itinerary, preferences } = await loadOwned(input.itineraryId);
    const prefs = refinedPreferences(
      preferences,
      { pace: input.pace, budgetRupees: input.budgetRupees },
      new Date(),
    );
    await generateItineraryForCurrentUser({
      prefs,
      kind: "refine",
      itineraryId: itinerary.id,
      refinement: { previous: itinerary.version.plan, request: input.request },
    });
    refresh();
    return ok({ done: true });
  } catch (error) {
    return toLoggedFailure("itineraries.refine_failed", error);
  }
}

export async function regenerateItinerary(
  _prev: ItineraryActionResult,
  formData: FormData,
): Promise<ItineraryActionResult> {
  try {
    const { itineraryId } = parseInput(itineraryIdSchema, formData);
    const { itinerary, preferences } = await loadOwned(itineraryId);
    const prefs = refinedPreferences(preferences, {}, new Date());
    await generateItineraryForCurrentUser({ prefs, kind: "regenerate", itineraryId: itinerary.id });
    refresh();
    return ok({ done: true });
  } catch (error) {
    return toLoggedFailure("itineraries.regenerate_failed", error);
  }
}

export async function makeVersionCurrent(
  _prev: ItineraryActionResult,
  formData: FormData,
): Promise<ItineraryActionResult> {
  try {
    const input = parseInput(setVersionSchema, formData);
    await setCurrentVersion(input.itineraryId, input.version);
    refresh();
    return ok({ done: true });
  } catch (error) {
    return toLoggedFailure("itineraries.set_version_failed", error);
  }
}

export async function removeItinerary(
  _prev: ItineraryActionResult,
  formData: FormData,
): Promise<ItineraryActionResult> {
  try {
    const { itineraryId } = parseInput(itineraryIdSchema, formData);
    await deleteItinerary(itineraryId);
  } catch (error) {
    return toLoggedFailure("itineraries.delete_failed", error);
  }
  redirect("/itineraries");
}
