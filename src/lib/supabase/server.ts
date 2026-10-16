import "server-only";

import { createServerClient } from "@supabase/ssr";
import { io } from "next/cache";
import { cookies } from "next/headers";

import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers,
 * acting as the signed-in user (RLS applies). Reads request cookies, so with
 * Cache Components enabled any component calling this must render inside a
 * <Suspense> boundary.
 *
 * There is intentionally no secret-key (RLS-bypassing) client yet. Add one
 * only for a documented admin path; see docs/security/SECURITY.md.
 */
export async function createSupabaseServerClient() {
  // Read cookies first: during prerendering this defers the caller to request
  // time, so builds never need Supabase environment variables.
  const cookieStore = await cookies();
  // supabase-js reads Date.now() while loading the session. io() keeps that
  // out of (runtime) prerenders; it resolves immediately during a request.
  await io();
  const env = getPublicEnv();

  return createServerClient<Database>(
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
            // Server Components cannot set cookies; src/proxy.ts refreshes
            // the session cookie before rendering instead.
          }
        },
      },
    },
  );
}
