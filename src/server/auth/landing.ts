import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import { homePathFor } from "./session";

/**
 * Where to send someone who just signed in without a `next` destination: their
 * account type's home (admins to the console, partners to their portal,
 * travellers to their account, untyped Google accounts to choose a type).
 * Takes the client that performed the sign-in (its session is in memory; the
 * new cookie isn't readable until the next request). Reads only the caller's
 * own profile (RLS).
 */
export async function landingPathFor(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("profiles")
    .select("account_type")
    .eq("id", userId)
    .maybeSingle();
  return homePathFor(error ? null : (data?.account_type ?? null));
}
