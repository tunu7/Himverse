import "server-only";

import { AppError } from "@/lib/errors";
import { toAppError } from "@/lib/supabase/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { type AccountType, requireUser } from "@/server/auth/session";

export type MyProfile = { id: string; displayName: string; email: string | null };

export async function getMyProfile(): Promise<MyProfile> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("id", user.id)
    .single();
  if (error) {
    throw toAppError(error, "Could not load your profile.");
  }
  return { id: data.id, displayName: data.display_name, email: user.email };
}

export async function updateMyDisplayName(displayName: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ display_name: displayName })
    .eq("id", user.id)
    .select("id");
  if (error) {
    throw toAppError(error, "Could not update your profile.");
  }
  if (data.length !== 1) {
    throw new AppError("NOT_FOUND", "We couldn't find your profile.");
  }
}

/**
 * Sets the account's type once (accounts created with Google start without
 * one). The database refuses admin and any change after the first choice.
 */
export async function chooseMyAccountType(
  accountType: Exclude<AccountType, "admin">,
): Promise<AccountType> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("choose_account_type", { p_type: accountType });
  if (error) {
    if (error.code === "55000") {
      throw new AppError(
        "CONFLICT",
        "This account is already set up. Use a different account for the other role.",
        { cause: error },
      );
    }
    throw toAppError(error, "Could not set up your account.");
  }
  return data;
}
