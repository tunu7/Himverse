"use server";

import { refresh } from "next/cache";

import { type ActionResult, ok, toLoggedFailure } from "@/lib/errors";
import { parseInput } from "@/lib/validation";
import { updateMyDisplayName } from "@/server/profiles/profiles";

import { updateProfileSchema } from "./schemas";

export type UpdateProfileResult = ActionResult<{ saved: true }> | null;

export async function updateProfile(
  _prev: UpdateProfileResult,
  formData: FormData,
): Promise<UpdateProfileResult> {
  try {
    const input = parseInput(updateProfileSchema, formData);
    await updateMyDisplayName(input.displayName); // requires a signed-in user
    refresh();
    return ok({ saved: true });
  } catch (error) {
    return toLoggedFailure("account.update_profile_failed", error);
  }
}
