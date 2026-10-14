"use server";

import { refresh } from "next/cache";

import { type ActionResult, ok, toLoggedFailure } from "@/lib/errors";
import { parseInput } from "@/lib/validation";
import {
  createExperience,
  createProviderApplication,
  setExperienceAcceptsBookings,
  setExperienceStatus,
  submitProviderApplication,
} from "@/server/providers/providers";

import {
  acceptsBookingsSchema,
  experienceStatusSchema,
  newExperienceSchema,
  providerApplicationSchema,
  providerIdSchema,
} from "./schemas";

// Authorization: every server function below requires a signed-in user and the
// database enforces membership, verification and transitions (ADR-0002).

export type ProviderActionResult = ActionResult<{ done: true }> | null;

export async function applyAsProvider(
  _prev: ProviderActionResult,
  formData: FormData,
): Promise<ProviderActionResult> {
  try {
    const input = parseInput(providerApplicationSchema, formData);
    await createProviderApplication(input);
    refresh();
    return ok({ done: true });
  } catch (error) {
    return toLoggedFailure("providers.apply_failed", error);
  }
}

export async function submitForReview(
  _prev: ProviderActionResult,
  formData: FormData,
): Promise<ProviderActionResult> {
  try {
    const { providerId } = parseInput(providerIdSchema, formData);
    await submitProviderApplication(providerId);
    refresh();
    return ok({ done: true });
  } catch (error) {
    return toLoggedFailure("providers.submit_failed", error);
  }
}

export async function addExperience(
  _prev: ProviderActionResult,
  formData: FormData,
): Promise<ProviderActionResult> {
  try {
    const input = parseInput(newExperienceSchema, formData);
    await createExperience({
      providerId: input.providerId,
      destinationId: input.destinationId,
      slug: input.slug,
      title: input.title,
      summary: input.summary,
      category: input.category,
      durationMinutes: input.durationMinutes,
      priceFromMinor: input.priceFromRupees,
    });
    refresh();
    return ok({ done: true });
  } catch (error) {
    return toLoggedFailure("providers.add_experience_failed", error);
  }
}

export async function changeExperienceStatus(
  _prev: ProviderActionResult,
  formData: FormData,
): Promise<ProviderActionResult> {
  try {
    const input = parseInput(experienceStatusSchema, formData);
    await setExperienceStatus(input.experienceId, input.status);
    refresh();
    return ok({ done: true });
  } catch (error) {
    return toLoggedFailure("providers.change_experience_status_failed", error);
  }
}

export async function changeExperienceAcceptsBookings(
  _prev: ProviderActionResult,
  formData: FormData,
): Promise<ProviderActionResult> {
  try {
    const input = parseInput(acceptsBookingsSchema, formData);
    await setExperienceAcceptsBookings(input.experienceId, input.acceptsBookings);
    refresh();
    return ok({ done: true });
  } catch (error) {
    return toLoggedFailure("providers.change_accepts_bookings_failed", error);
  }
}
