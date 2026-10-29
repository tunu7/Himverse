import "server-only";

import { getPublicEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { getAssurance } from "./assurance";
import { type AuthErrorLike, captchaError, isCaptchaFailure } from "./auth-errors";
import { landingPathFor } from "./landing";
import { enforceLimits, ipCheck, trustedClientIp } from "./request-limits";
import { requireUser } from "./session";

/**
 * Phone sign-in and phone linking with SMS codes, through Supabase Auth's own
 * OTP (ADR-0011): Supabase generates, stores (hashed), expires and checks the
 * codes; we never see or log them. Off unless NEXT_PUBLIC_AUTH_PHONE_ENABLED is
 * "true" and an SMS provider is configured in Supabase Auth.
 *
 * Signing in and signing up are the same request (a new number creates an
 * account), so the answer never reveals whether a number is registered.
 */

const DISABLED = "Phone sign-in isn't available. Please use your email instead.";
const UNAVAILABLE = "We can't send a code right now. Please try again shortly.";
const WRONG_CODE = "That code is wrong or has expired. Check it, or send a new one.";

function assertEnabled(): void {
  if (getPublicEnv().NEXT_PUBLIC_AUTH_PHONE_ENABLED !== "true") {
    throw new AppError("FORBIDDEN", DISABLED);
  }
}

function isRateLimited(error: AuthErrorLike): boolean {
  return error.status === 429 || (error.code?.startsWith("over_") ?? false);
}

function sendError(error: AuthErrorLike): AppError {
  if (isCaptchaFailure(error)) return captchaError(error);
  if (isRateLimited(error)) {
    return new AppError("RATE_LIMITED", "Too many codes sent. Please wait and try again.", {
      cause: error,
    });
  }
  if (error.code === "phone_provider_disabled" || error.code === "signup_disabled") {
    return new AppError("FORBIDDEN", DISABLED, { cause: error });
  }
  // SMS provider failures (e.g. sms_send_failed) and Auth outages.
  return new AppError("UPSTREAM_UNAVAILABLE", UNAVAILABLE, { cause: error });
}

function verifyError(error: AuthErrorLike): AppError {
  if (isRateLimited(error)) {
    return new AppError("RATE_LIMITED", "Too many attempts. Please wait and try again.", {
      cause: error,
    });
  }
  if (error.name === "AuthRetryableFetchError" || (error.status ?? 0) >= 500) {
    return new AppError("UPSTREAM_UNAVAILABLE", UNAVAILABLE, { cause: error });
  }
  return new AppError("UNAUTHENTICATED", WRONG_CODE, {
    cause: error,
    fieldErrors: { code: [WRONG_CODE] },
  });
}

/** SMS sends: per number (cooldown and hourly), per visitor, and a daily platform budget. */
async function enforceSendLimits(phone: string): Promise<void> {
  await enforceLimits(
    [
      { bucket: "sms_send_cooldown", key: phone },
      { bucket: "sms_send_phone", key: phone },
      ...ipCheck("sms_send_ip", await trustedClientIp()),
      { bucket: "sms_daily", key: "platform" },
    ],
    { failClosed: true },
  );
}

async function enforceVerifyLimits(phone: string): Promise<void> {
  await enforceLimits(
    [
      { bucket: "sms_verify_phone", key: phone },
      ...ipCheck("sms_verify_ip", await trustedClientIp()),
    ],
    { failClosed: true },
  );
}

/** Texts a sign-in code. A new number creates an account (traveller or partner, if chosen). */
export async function sendSignInCode(input: {
  phone: string;
  accountType?: "traveller" | "partner" | undefined;
  captchaToken?: string | undefined;
}): Promise<void> {
  assertEnabled();
  await enforceSendLimits(input.phone);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    phone: input.phone,
    options: {
      channel: "sms",
      shouldCreateUser: true,
      captchaToken: input.captchaToken,
      // Read by the database only when the account is created; never admin (ADR-0007).
      ...(input.accountType ? { data: { account_type: input.accountType } } : {}),
    },
  });
  if (error) throw sendError(error);
  logger.info("auth.sms_code_sent", { purpose: "sign_in" });
}

/** Checks a sign-in code; on success the session cookie is set. Returns where to land. */
export async function verifySignInCode(phone: string, code: string): Promise<string> {
  assertEnabled();
  await enforceVerifyLimits(phone);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({ phone, token: code, type: "sms" });
  if (error || !data.user) {
    // Never the code or the number.
    logger.warn("auth.sms_code_rejected", { purpose: "sign_in", code: error?.code });
    throw verifyError(error ?? {});
  }
  return landingPathFor(supabase, data.user.id);
}

/** Linking needs the second step first when the account has one, as for password changes. */
async function requireLinkingAllowed(): Promise<void> {
  await requireUser();
  const assurance = await getAssurance();
  if (!assurance || (assurance.hasVerifiedTotp && assurance.aal !== "aal2")) {
    throw new AppError("FORBIDDEN", "Verify your two-step login first.");
  }
}

/**
 * Adds or changes the signed-in account's phone number: Supabase texts a code
 * to the new number, and the number is attached only once that code is
 * entered (proof of control of both the account and the phone).
 */
export async function startPhoneLink(phone: string): Promise<void> {
  assertEnabled();
  await requireLinkingAllowed();
  await enforceSendLimits(phone);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ phone });
  if (error) {
    if (error.code === "phone_exists") {
      throw new AppError(
        "CONFLICT",
        "That number can't be added. If it belongs to another account, sign in with it instead.",
        { cause: error, fieldErrors: { phone: ["This number can't be added."] } },
      );
    }
    throw sendError(error);
  }
  logger.info("auth.sms_code_sent", { purpose: "phone_link" });
}

export async function confirmPhoneLink(phone: string, code: string): Promise<void> {
  assertEnabled();
  await requireLinkingAllowed();
  await enforceVerifyLimits(phone);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ phone, token: code, type: "phone_change" });
  if (error) {
    logger.warn("auth.sms_code_rejected", { purpose: "phone_link", code: error.code });
    throw verifyError(error);
  }
  logger.info("auth.phone_linked");
}

/** The signed-in account's confirmed phone number in international form, or null. Asks the Auth server. */
export async function getMyPhone(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  // Supabase stores numbers without the "+".
  return error || !data.user.phone ? null : `+${data.user.phone}`;
}
