import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getPublicEnv } from "@/lib/env";
import { getServerEnv } from "@/lib/env.server";
import type { Database } from "@/types/database";

/**
 * The request-limit counter (ADR-0011). `hit_rate_limit` is executable only by
 * service_role, so browsers can't spend someone else's budget; this module is
 * the only caller. The secret key bypasses RLS and every grant, so this module
 * must keep calling that one function and nothing else.
 */
function limiterClient() {
  return createClient<Database>(
    getPublicEnv().NEXT_PUBLIC_SUPABASE_URL,
    getServerEnv().SUPABASE_SECRET_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      // A slow counter must not hold up sign-in: give up quickly and let the
      // caller apply its fail-open or fail-closed rule.
      global: {
        fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(3_000) }),
      },
    },
  );
}

export type Hit = { allowed: boolean; retryAfterSeconds: number };

/** Counts one request against `bucket` for `keyHash`; throws if the counter can't be reached. */
export async function hitRateLimit(input: {
  bucket: string;
  keyHash: string;
  limit: number;
  windowSeconds: number;
}): Promise<Hit> {
  const { data, error } = await limiterClient()
    .rpc("hit_rate_limit", {
      p_bucket: input.bucket,
      p_key_hash: input.keyHash,
      p_limit: input.limit,
      p_window_seconds: input.windowSeconds,
    })
    .single();
  if (error) throw error;
  return { allowed: data.allowed, retryAfterSeconds: data.retry_after_seconds };
}
