import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getPublicEnv } from "@/lib/env";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers,
 * acting as the signed-in user (RLS applies). Reads request cookies, so with
 * Cache Components enabled any component calling this must render inside a
 * <Suspense> boundary.
 *
 * There is intentionally no secret-key (RLS-bypassing) client yet. Add one
 * only for a documented admin path; see docs/security/AUTHORIZATION_AND_RLS.md.
 */
export async function createSupabaseServerClient() {
  const env = getPublicEnv();
  const cookieStore = await cookies();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot set cookies. Session refresh will be
            // handled in src/proxy.ts when authentication is implemented.
          }
        },
      },
    },
  );
}
