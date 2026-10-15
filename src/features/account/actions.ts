"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { type ActionResult, ok, toLoggedFailure } from "@/lib/errors";
import { parseInput } from "@/lib/validation";
import { deleteMyAccount } from "@/server/auth/account-deletion";
import { updateMyDisplayName } from "@/server/profiles/profiles";

import { deleteAccountSchema, updateProfileSchema } from "./schemas";

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

export type DeleteAccountResult = ActionResult<never> | null;

/** Permanently deletes the signed-in account, then leaves for the home page. */
export async function deleteAccount(
  _prev: DeleteAccountResult,
  formData: FormData,
): Promise<DeleteAccountResult> {
  try {
    const input = parseInput(deleteAccountSchema, formData);
    await deleteMyAccount(input); // authenticates and re-verifies the user
  } catch (error) {
    return toLoggedFailure("account.delete_failed", error);
  }
  redirect("/account-deleted");
}
