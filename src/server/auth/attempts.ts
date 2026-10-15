import "server-only";

import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Per-account limits on guessing secrets (two-step codes, the current
 * password). Supabase Auth limits by IP, and all our auth calls share the
 * server's IP, so this is the per-account limit (migration auth_attempt_limits).
 */
export type AttemptKind = "mfa_code" | "current_password";

const TOO_MANY = "Too many wrong attempts. Please wait 15 minutes and try again.";

export async function assertAttemptAllowed(kind: AttemptKind): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("auth_attempt_allowed", { p_kind: kind });
  // Fail closed: if the limit can't be checked, don't allow guessing.
  if (error || data !== true) {
    if (error) logger.error("auth.attempt_check_failed", { kind, code: error.code });
    throw new AppError("RATE_LIMITED", TOO_MANY, { cause: error ?? undefined });
  }
}

export async function recordFailedAttempt(kind: AttemptKind, userId: string): Promise<void> {
  // Never the guessed value: only that a guess failed (for spotting attacks).
  logger.warn("auth.attempt_failed", { kind, userId });
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_auth_failure", { p_kind: kind });
  if (error) logger.error("auth.attempt_record_failed", { kind, code: error.code });
}
