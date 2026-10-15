import "server-only";

import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { assertAttemptAllowed, recordFailedAttempt } from "./attempts";
import type { AuthErrorLike } from "./auth-errors";
import { requireUser } from "./session";

/**
 * Two-step login with an authenticator app (Supabase MFA, TOTP). Required for
 * partner and admin accounts (ADR-0007); the database refuses their powers to
 * sessions below aal2 (migration two_step_login).
 */

export type TotpEnrollment = { factorId: string; qrCode: string; secret: string };

const WRONG_CODE = "That code didn't work. Check the time on your phone and try the newest code.";

function codeError(error: AuthErrorLike): AppError {
  if (error.status === 429 || (error.code?.startsWith("over_") ?? false)) {
    return new AppError("RATE_LIMITED", "Too many attempts. Please wait a minute and try again.", {
      cause: error,
    });
  }
  if (
    error.code === "mfa_verification_failed" ||
    error.code === "mfa_challenge_expired" ||
    error.status === 422
  ) {
    return new AppError("VALIDATION_FAILED", "Please check the highlighted fields.", {
      cause: error,
      fieldErrors: { code: [WRONG_CODE] },
    });
  }
  return new AppError(
    "UPSTREAM_UNAVAILABLE",
    "We couldn't check the code right now. Please try again.",
    {
      cause: error,
    },
  );
}

/**
 * Starts adding an authenticator: returns the QR code and the secret for
 * manual entry. Unfinished earlier attempts are removed first so they don't
 * pile up against the factor limit.
 */
export async function startTotpEnrollment(): Promise<TotpEnrollment> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) throw codeError(listError);
  if (factors.totp.length > 0) {
    throw new AppError("CONFLICT", "Two-step login is already set up for this account.");
  }
  for (const factor of factors.all) {
    if (factor.factor_type === "totp" && factor.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Authenticator app",
    issuer: "Himverse.AI",
  });
  if (error) {
    logger.error("auth.mfa_enroll_failed", { code: error.code, status: error.status });
    throw new AppError(
      "UPSTREAM_UNAVAILABLE",
      "We couldn't start two-step setup. Please try again.",
      {
        cause: error,
      },
    );
  }
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

/** Finishes adding an authenticator with its first code; the session becomes aal2. */
export async function confirmTotpEnrollment(factorId: string, code: string): Promise<void> {
  const user = await requireUser();
  await assertAttemptAllowed("mfa_code");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) await failCode(error, user.id);
}

/** Counts a wrong code against the account's limit, then reports it. */
async function failCode(error: AuthErrorLike, userId: string): Promise<never> {
  const appError = codeError(error);
  if (appError.code === "VALIDATION_FAILED") await recordFailedAttempt("mfa_code", userId);
  throw appError;
}

/** The second step at sign-in: verifies a code from the enrolled authenticator. */
export async function verifySecondStep(code: string): Promise<void> {
  const user = await requireUser();
  await assertAttemptAllowed("mfa_code");
  const supabase = await createSupabaseServerClient();
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) throw codeError(listError);
  const factor = factors.totp[0];
  if (!factor) {
    throw new AppError("CONFLICT", "Set up two-step login first.");
  }
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) await failCode(error, user.id);
}
