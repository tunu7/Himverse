"use server";

import { refresh } from "next/cache";

import { type ActionResult, ok, toLoggedFailure } from "@/lib/errors";
import { parseInput } from "@/lib/validation";
import {
  createDestination,
  deleteDestination,
  moderateExperience,
  updateDestination,
} from "@/server/admin/admin";
import { reviewProvider } from "@/server/providers/providers";

import {
  destinationIdSchema,
  destinationSchema,
  moderateExperienceSchema,
  reviewProviderSchema,
} from "./schemas";

export type ReviewResult = ActionResult<{ done: true }> | null;

export async function reviewProviderAction(
  _prev: ReviewResult,
  formData: FormData,
): Promise<ReviewResult> {
  try {
    const input = parseInput(reviewProviderSchema, formData);
    // reviewProvider() requires admin; the database function re-checks it.
    await reviewProvider(input.providerId, input.decision, input.note);
    refresh();
    return ok({ done: true });
  } catch (error) {
    return toLoggedFailure("admin.review_provider_failed", error);
  }
}

export type AdminActionResult = ActionResult<{ done: true }> | null;

export async function saveDestinationAction(
  _prev: AdminActionResult,
  formData: FormData,
): Promise<AdminActionResult> {
  try {
    const { id, ...input } = parseInput(destinationSchema, formData);
    if (id) {
      await updateDestination(id, input);
    } else {
      await createDestination(input);
    }
    refresh();
    return ok({ done: true });
  } catch (error) {
    return toLoggedFailure("admin.save_destination_failed", error);
  }
}

export async function deleteDestinationAction(
  _prev: AdminActionResult,
  formData: FormData,
): Promise<AdminActionResult> {
  try {
    const { id } = parseInput(destinationIdSchema, formData);
    await deleteDestination(id);
    refresh();
    return ok({ done: true });
  } catch (error) {
    return toLoggedFailure("admin.delete_destination_failed", error);
  }
}

export async function moderateExperienceAction(
  _prev: AdminActionResult,
  formData: FormData,
): Promise<AdminActionResult> {
  try {
    const input = parseInput(moderateExperienceSchema, formData);
    await moderateExperience(input.experienceId, input.action);
    refresh();
    return ok({ done: true });
  } catch (error) {
    return toLoggedFailure("admin.moderate_experience_failed", error);
  }
}
