"use server";

import { redirect } from "next/navigation";

import { getPublicEnv } from "@/lib/env";
import { type ActionResult, ok, toLoggedFailure } from "@/lib/errors";
import { safeRedirectPath } from "@/lib/redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseInput } from "@/lib/validation";
import { signInError, signUpError } from "@/server/auth/auth-errors";
import { landingPathFor } from "@/server/auth/landing";
import {
  confirmTotpEnrollment,
  startTotpEnrollment,
  type TotpEnrollment,
  verifySecondStep,
} from "@/server/auth/mfa";
import {
  changePassword,
  completePasswordReset,
  requestPasswordReset,
  resendConfirmation,
} from "@/server/auth/passwords";
import {
  confirmPhoneLink,
  sendSignInCode,
  startPhoneLink,
  verifySignInCode,
} from "@/server/auth/phone";
import { emailKey, enforceLimits, ipCheck, trustedClientIp } from "@/server/auth/request-limits";
import { getCurrentAccount, homePathFor } from "@/server/auth/session";
import { chooseMyAccountType } from "@/server/profiles/profiles";

import {
  changePasswordSchema,
  chooseAccountTypeSchema,
  confirmPhoneLinkSchema,
  confirmTotpSchema,
  emailOnlySchema,
  newPasswordSchema,
  sendPhoneCodeSchema,
  signInSchema,
  signUpSchema,
  startPhoneLinkSchema,
  verifyPhoneCodeSchema,
  verifySecondStepSchema,
} from "./schemas";

export type SignUpResult = ActionResult<{ needsEmailConfirmation: true }> | null;
export type SignInResult = ActionResult<never> | null;

export async function signUp(_prev: SignUpResult, formData: FormData): Promise<SignUpResult> {
  let destination: string;
  try {
    const input = parseInput(signUpSchema, formData);
    await enforceLimits(ipCheck("sign_up_ip", await trustedClientIp()), { failClosed: false });
    const supabase = await createSupabaseServerClient();
    const next = safeRedirectPath(input.next);
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        captchaToken: input.captchaToken,
        // display_name prefills the profile. account_type is the user's own
        // choice of traveller or partner; the database ignores anything else.
        data: { display_name: input.displayName, account_type: input.accountType },
        emailRedirectTo: `${getPublicEnv().NEXT_PUBLIC_SITE_URL}/auth/confirm?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      throw signUpError(error);
    }
    if (!data.session) {
      return ok({ needsEmailConfirmation: true });
    }
    destination = next;
  } catch (error) {
    return toLoggedFailure("auth.sign_up_failed", error);
  }
  redirect(destination);
}

export async function signIn(_prev: SignInResult, formData: FormData): Promise<SignInResult> {
  let destination: string;
  try {
    const input = parseInput(signInSchema, formData);
    await enforceLimits(
      [
        ...ipCheck("sign_in_ip", await trustedClientIp()),
        { bucket: "sign_in_email", key: emailKey(input.email) },
      ],
      { failClosed: false },
    );
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
      options: { captchaToken: input.captchaToken },
    });
    if (error) {
      throw signInError(error);
    }
    // An explicit destination wins; otherwise land by role (admin, partner, traveller).
    destination = input.next
      ? safeRedirectPath(input.next)
      : await landingPathFor(supabase, data.user.id);
  } catch (error) {
    return toLoggedFailure("auth.sign_in_failed", error);
  }
  redirect(destination);
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}

export type ChooseAccountTypeResult = ActionResult<never> | null;

/** One-time choice for accounts created with Google (ADR-0007). */
export async function chooseAccountType(
  _prev: ChooseAccountTypeResult,
  formData: FormData,
): Promise<ChooseAccountTypeResult> {
  let destination: string;
  try {
    const input = parseInput(chooseAccountTypeSchema, formData);
    const accountType = await chooseMyAccountType(input.accountType);
    destination = safeRedirectPath(input.next, homePathFor(accountType));
  } catch (error) {
    return toLoggedFailure("auth.choose_account_type_failed", error);
  }
  redirect(destination);
}

export type EmailSentResult = ActionResult<{ sent: true }> | null;

/** Recovery and confirmation emails, per visitor and per address (ADR-0011). */
async function enforceEmailSendLimits(email: string): Promise<void> {
  await enforceLimits(
    [
      ...ipCheck("email_send_ip", await trustedClientIp()),
      { bucket: "email_send_email", key: emailKey(email) },
    ],
    { failClosed: false },
  );
}

/** "Forgot password": always the same answer, whether or not the address exists. */
export async function requestPasswordResetAction(
  _prev: EmailSentResult,
  formData: FormData,
): Promise<EmailSentResult> {
  try {
    const input = parseInput(emailOnlySchema, formData);
    await enforceEmailSendLimits(input.email);
    await requestPasswordReset(input.email, input.captchaToken);
    return ok({ sent: true });
  } catch (error) {
    return toLoggedFailure("auth.password_reset_request_failed", error);
  }
}

/** "Resend confirmation email": same answer whether or not the address exists. */
export async function resendConfirmationAction(
  _prev: EmailSentResult,
  formData: FormData,
): Promise<EmailSentResult> {
  try {
    const input = parseInput(emailOnlySchema, formData);
    await enforceEmailSendLimits(input.email);
    await resendConfirmation(input.email, input.captchaToken);
    return ok({ sent: true });
  } catch (error) {
    return toLoggedFailure("auth.resend_confirmation_failed", error);
  }
}

export type PasswordResult = ActionResult<{ done: true }> | null;

/** Sets a new password from a reset link, then continues to the account's home. */
export async function completePasswordResetAction(
  _prev: PasswordResult,
  formData: FormData,
): Promise<PasswordResult> {
  let destination: string;
  try {
    const input = parseInput(newPasswordSchema, formData);
    await completePasswordReset(input.password);
    const account = await getCurrentAccount();
    destination = `${homePathFor(account?.accountType ?? null)}?password=updated`;
  } catch (error) {
    return toLoggedFailure("auth.password_reset_failed", error);
  }
  redirect(destination);
}

/** Account settings: change password (checks the current one). */
export async function changePasswordAction(
  _prev: PasswordResult,
  formData: FormData,
): Promise<PasswordResult> {
  try {
    const input = parseInput(changePasswordSchema, formData);
    await changePassword(input.currentPassword, input.password, input.captchaToken);
    return ok({ done: true });
  } catch (error) {
    return toLoggedFailure("auth.change_password_failed", error);
  }
}

export type TotpEnrollmentResult = ActionResult<TotpEnrollment> | null;

/** Two-step setup, step 1: a QR code and secret for the authenticator app. */
export async function startTotpEnrollmentAction(): Promise<TotpEnrollmentResult> {
  try {
    return ok(await startTotpEnrollment());
  } catch (error) {
    return toLoggedFailure("auth.mfa_enroll_failed", error);
  }
}

export type SecondStepResult = ActionResult<never> | null;

async function afterSecondStep(next: string | undefined): Promise<string> {
  const account = await getCurrentAccount();
  return safeRedirectPath(next, homePathFor(account?.accountType ?? null));
}

/** Two-step setup, step 2: the first code from the app turns it on. */
export async function confirmTotpEnrollmentAction(
  _prev: SecondStepResult,
  formData: FormData,
): Promise<SecondStepResult> {
  let destination: string;
  try {
    const input = parseInput(confirmTotpSchema, formData);
    await confirmTotpEnrollment(input.factorId, input.code);
    destination = await afterSecondStep(input.next);
  } catch (error) {
    return toLoggedFailure("auth.mfa_confirm_failed", error);
  }
  redirect(destination);
}

/** The second step at sign-in. */
export async function verifySecondStepAction(
  _prev: SecondStepResult,
  formData: FormData,
): Promise<SecondStepResult> {
  let destination: string;
  try {
    const input = parseInput(verifySecondStepSchema, formData);
    await verifySecondStep(input.code);
    destination = await afterSecondStep(input.next);
  } catch (error) {
    return toLoggedFailure("auth.mfa_verify_failed", error);
  }
  redirect(destination);
}

export type PhoneCodeSentResult = ActionResult<{ phone: string }> | null;
export type PhoneVerifiedResult = ActionResult<never> | null;
export type PhoneLinkedResult = ActionResult<{ phone: string; linked: boolean }> | null;

/** Phone sign-in, step 1: text a code (ADR-0011). Returns the number in international form. */
export async function sendSignInCodeAction(
  _prev: PhoneCodeSentResult,
  formData: FormData,
): Promise<PhoneCodeSentResult> {
  try {
    const input = parseInput(sendPhoneCodeSchema, formData);
    await sendSignInCode(input);
    return ok({ phone: input.phone });
  } catch (error) {
    return toLoggedFailure("auth.sms_send_failed", error);
  }
}

/** Phone sign-in, step 2: check the code, then land by role (or at `next`). */
export async function verifySignInCodeAction(
  _prev: PhoneVerifiedResult,
  formData: FormData,
): Promise<PhoneVerifiedResult> {
  let destination: string;
  try {
    const input = parseInput(verifyPhoneCodeSchema, formData);
    const landing = await verifySignInCode(input.phone, input.code);
    destination = input.next ? safeRedirectPath(input.next) : landing;
  } catch (error) {
    return toLoggedFailure("auth.sms_verify_failed", error);
  }
  redirect(destination);
}

/** Account settings: add or change the phone number, step 1 (a code to the new number). */
export async function startPhoneLinkAction(
  _prev: PhoneLinkedResult,
  formData: FormData,
): Promise<PhoneLinkedResult> {
  try {
    const input = parseInput(startPhoneLinkSchema, formData);
    await startPhoneLink(input.phone);
    return ok({ phone: input.phone, linked: false });
  } catch (error) {
    return toLoggedFailure("auth.phone_link_start_failed", error);
  }
}

/** Account settings: add or change the phone number, step 2 (the code attaches it). */
export async function confirmPhoneLinkAction(
  _prev: PhoneLinkedResult,
  formData: FormData,
): Promise<PhoneLinkedResult> {
  try {
    const input = parseInput(confirmPhoneLinkSchema, formData);
    await confirmPhoneLink(input.phone, input.code);
    return ok({ phone: input.phone, linked: true });
  } catch (error) {
    return toLoggedFailure("auth.phone_link_confirm_failed", error);
  }
}
