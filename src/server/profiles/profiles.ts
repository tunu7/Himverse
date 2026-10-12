import "server-only";

import { AppError } from "@/lib/errors";
import { toAppError } from "@/lib/supabase/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/server/auth/session";

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
