import "server-only";

import { cache } from "react";

import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * How the current session was established, read from the verified JWT
 * (`getClaims()` verifies the signature):
 * - `aal`: "aal2" once a second factor (TOTP) has been verified this session.
 * - `methods`: authentication methods with their times (e.g. password,
 *   oauth, recovery, totp).
 * - `hasVerifiedTotp`: whether the account has an authenticator enrolled.
 */
export type Assurance = {
  aal: "aal1" | "aal2";
  methods: { method: string; at: number | null }[];
  hasVerifiedTotp: boolean;
};

export const getAssurance = cache(async (): Promise<Assurance | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims.sub) return null;
  const claims = data.claims;
  const methods = (claims.amr ?? []).map((entry) =>
    typeof entry === "string"
      ? { method: entry, at: null }
      : { method: entry.method, at: typeof entry.timestamp === "number" ? entry.timestamp : null },
  );
  const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
  if (factorsError) {
    logger.error("auth.mfa_factors_lookup_failed", { code: factorsError.code });
  }
  return {
    aal: claims.aal === "aal2" ? "aal2" : "aal1",
    methods,
    // Fail closed: if factors can't be read, treat as enrolled so the user is
    // asked to verify rather than skipping the second step.
    hasVerifiedTotp: factorsError ? true : factors.totp.length > 0,
  };
});

/** A password-recovery sign-in from the last `maxAgeSeconds` (reset links). */
export function recentRecovery(assurance: Assurance, maxAgeSeconds: number, now = Date.now()) {
  return assurance.methods.some(
    (m) => m.method === "recovery" && m.at !== null && now / 1000 - m.at <= maxAgeSeconds,
  );
}
