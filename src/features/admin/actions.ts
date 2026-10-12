"use server";

import { refresh } from "next/cache";

import { type ActionResult, ok, toLoggedFailure } from "@/lib/errors";
import { parseInput } from "@/lib/validation";
import { reviewProvider } from "@/server/providers/providers";

import { reviewProviderSchema } from "./schemas";

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
