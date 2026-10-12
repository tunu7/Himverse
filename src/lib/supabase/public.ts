import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Cookie-less server client that always acts as the anonymous role, so RLS
 * returns exactly the intentionally public rows. Use it for public pages
 * (e.g. /explore) so a signed-in provider or admin never sees their private
 * rows mixed into public listings.
 */
export function createSupabasePublicClient() {
  const env = getPublicEnv();
  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
}
