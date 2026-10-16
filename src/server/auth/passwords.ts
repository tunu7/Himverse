import "server-only";

import { getPublicEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { getAssurance, recentRecovery } from "./assurance";
import { assertAttemptAllowed, recordFailedAttempt } from "./attempts";
import { type AuthErrorLike, captchaError, isCaptchaFailure } from "./auth-errors";
import { requireUser } from "./session";

/** Reset links are single-use and short-lived; the form must be used soon after. */
export const RECOVERY_WINDOW_SECONDS = 15 * 60;

const RATE_LIMITED = "Too many requests. Please wait a few minutes and try again.";

function isRateLimited(error: AuthErrorLike): boolean {
  return error.status === 429 || (error.code?.startsWith("over_") ?? false);
}

/**
 * Supabase limits emails per address and answers 429 only for addresses that
 * exist, so surfacing it would reveal accounts. Report every outcome the same.
 */
function isPerAddressEmailLimit(error: AuthErrorLike): boolean {
  return error.code === "over_email_send_rate_limit";
}

/** Signing out other sessions must not fail silently: they may be an attacker's. */
async function signOutOthers(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const { error } = await supabase.auth.signOut({ scope: "others" });
  if (error)
    logger.error("auth.sign_out_others_failed", { code: error.code, status: error.status });
}

function passwordUpdateError(error: AuthErrorLike): AppError {
  if (error.code === "weak_password") {
    return new AppError("VALIDATION_FAILED", "Please choose a stronger password.", {
      cause: error,
      fieldErrors: { password: ["Password is too weak."] },
    });
  }
  if (error.code === "same_password") {
    return new AppError("VALIDATION_FAILED", "Please choose a new password.", {
      cause: error,
      fieldErrors: { password: ["This is your current password."] },
    });
  }
  if (error.code === "insufficient_aal") {
    return new AppError("FORBIDDEN", "Verify your two-step login first.", { cause: error });
  }
  if (isRateLimited(error)) return new AppError("RATE_LIMITED", RATE_LIMITED, { cause: error });
  return new AppError("INTERNAL", "We couldn't update your password. Please try again.", {
    cause: error,
  });
}

/**
 * Emails a reset link (PKCE: it works only in this browser, so a link can't be
 * used to sign someone else into an attacker's account). Never reveals whether
 * the address has an account.
 */
export async function requestPasswordReset(email: string, captchaToken?: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${getPublicEnv().NEXT_PUBLIC_SITE_URL}/auth/reset`,
    captchaToken,
  });
  if (error) {
    // Checked before the token is spent on the address, so it reveals nothing.
    if (isCaptchaFailure(error)) throw captchaError(error);
    if (isRateLimited(error) && !isPerAddressEmailLimit(error)) {
      throw new AppError("RATE_LIMITED", RATE_LIMITED, { cause: error });
    }
    // Unknown addresses, per-address limits and delivery problems look the same to the visitor.
    logger.warn("auth.password_reset_request_failed", { code: error.code, status: error.status });
  }
}

/**
 * Sets a new password from a reset link's session. Requires a recovery sign-in
 * from the last 15 minutes, and the second step for accounts that use one, so
 * a reset can't bypass two-step login. Signs out every other session.
 */
export async function completePasswordReset(password: string): Promise<void> {
  await requireUser();
  const assurance = await getAssurance();
  if (!assurance || !recentRecovery(assurance, RECOVERY_WINDOW_SECONDS)) {
    throw new AppError("FORBIDDEN", "This reset link has expired. Please request a new one.");
  }
  if (assurance.hasVerifiedTotp && assurance.aal !== "aal2") {
    throw new AppError("FORBIDDEN", "Verify your two-step login first.");
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw passwordUpdateError(error);
  await signOutOthers(supabase);
}

/**
 * Checks the signed-in user's current password, limited per account. The
 * check signs in on a separate, cookie-less client, so the current session
 * (and its two-step level) is untouched; that check session is then discarded.
 */
export async function verifyCurrentPassword(
  user: { id: string; email: string | null },
  currentPassword: string,
  field = "currentPassword",
  captchaToken?: string,
): Promise<void> {
  if (!user.email || !(await hasPasswordSignIn())) {
    throw new AppError("FORBIDDEN", "This account signs in with Google and has no password.");
  }
  await assertAttemptAllowed("current_password");
  const checker = createSupabasePublicClient();
  const { error: checkError } = await checker.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
    options: { captchaToken },
  });
  if (checkError) {
    // Not a wrong password: don't count it against the account.
    if (isCaptchaFailure(checkError)) throw captchaError(checkError);
    if (isRateLimited(checkError)) {
      throw new AppError("RATE_LIMITED", RATE_LIMITED, { cause: checkError });
    }
    await recordFailedAttempt("current_password", user.id);
    throw new AppError("VALIDATION_FAILED", "Please check the highlighted fields.", {
      cause: checkError,
      fieldErrors: { [field]: ["That isn't your current password."] },
    });
  }
  const { error: discardError } = await checker.auth.signOut({ scope: "local" });
  if (discardError) logger.warn("auth.check_session_discard_failed", { code: discardError.code });
}

/**
 * Signs the current session in again with the password, so its sign-in time is
 * fresh (the database checks it before irreversible actions such as deleting
 * the account). Only for accounts without two-step login: a new password
 * sign-in would drop a two-step session back to the first step.
 */
export async function reauthenticateWithPassword(
  user: { id: string; email: string | null },
  password: string,
  captchaToken?: string,
): Promise<void> {
  if (!user.email) {
    throw new AppError("FORBIDDEN", "This account signs in with Google and has no password.");
  }
  await assertAttemptAllowed("current_password");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: user.email,
    password,
    options: { captchaToken },
  });
  if (error && isCaptchaFailure(error)) throw captchaError(error);
  if (error || data.user?.id !== user.id) {
    if (error && isRateLimited(error)) {
      throw new AppError("RATE_LIMITED", RATE_LIMITED, { cause: error });
    }
    await recordFailedAttempt("current_password", user.id);
    throw new AppError("VALIDATION_FAILED", "Please check the highlighted fields.", {
      cause: error ?? undefined,
      fieldErrors: { password: ["That isn't your current password."] },
    });
  }
}

/**
 * Changes the password of a signed-in account after checking the current one.
 * Signs out every other session.
 */
export async function changePassword(
  currentPassword: string,
  password: string,
  captchaToken?: string,
): Promise<void> {
  const user = await requireUser();
  // Accounts with two-step login change passwords only after the second step.
  const assurance = await getAssurance();
  if (!assurance || (assurance.hasVerifiedTotp && assurance.aal !== "aal2")) {
    throw new AppError("FORBIDDEN", "Verify your two-step login first.");
  }
  await verifyCurrentPassword(user, currentPassword, "currentPassword", captchaToken);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw passwordUpdateError(error);
  await signOutOthers(supabase);
}

/** Whether the account can sign in with a password (not Google-only). Asks the Auth server. */
export async function hasPasswordSignIn(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return false;
  const providers: unknown = data.user.app_metadata.providers;
  return Array.isArray(providers)
    ? providers.includes("email")
    : data.user.app_metadata.provider === "email";
}

/** Re-sends the sign-up confirmation email. Never reveals whether the address exists. */
export async function resendConfirmation(email: string, captchaToken?: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: `${getPublicEnv().NEXT_PUBLIC_SITE_URL}/auth/confirm`,
      captchaToken,
    },
  });
  if (error) {
    if (isCaptchaFailure(error)) throw captchaError(error);
    if (isRateLimited(error) && !isPerAddressEmailLimit(error)) {
      throw new AppError("RATE_LIMITED", RATE_LIMITED, { cause: error });
    }
    logger.warn("auth.resend_confirmation_failed", { code: error.code, status: error.status });
  }
}
