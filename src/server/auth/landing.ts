import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * Where to send someone who just signed in without a `next` destination:
 * admins to the console, tourism partners to their portal, travellers to their
 * account. Takes the client that performed the sign-in (its session is in
 * memory; the new cookie isn't readable until the next request). Reads only the
 * caller's own rows (RLS); on any error, falls back to the traveller page.
 */
export async function landingPathFor(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string> {
  const [roles, memberships] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").limit(1),
    supabase.from("provider_members").select("provider_id").eq("user_id", userId).limit(1),
  ]);
  if (!roles.error && roles.data.length > 0) return "/admin";
  if (!memberships.error && memberships.data.length > 0) return "/provider";
  return "/account";
}
