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
import { getCurrentAccount, homePathFor } from "@/server/auth/session";
import { chooseMyAccountType } from "@/server/profiles/profiles";

import {
  changePasswordSchema,
  chooseAccountTypeSchema,
  confirmTotpSchema,
  emailOnlySchema,
  newPasswordSchema,
  signInSchema,
  signUpSchema,
  verifySecondStepSchema,
} from "./schemas";

export type SignUpResult = ActionResult<{ needsEmailConfirmation: true }> | null;
export type SignInResult = ActionResult<never> | null;

export async function signUp(_prev: SignUpResult, formData: FormData): Promise<SignUpResult> {
  let destination: string;
  try {
    const input = parseInput(signUpSchema, formData);
    const supabase = await createSupabaseServerClient();
    const next = safeRedirectPath(input.next);
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
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
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
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

/** "Forgot password": always the same answer, whether or not the address exists. */
export async function requestPasswordResetAction(
  _prev: EmailSentResult,
  formData: FormData,
): Promise<EmailSentResult> {
  try {
    const input = parseInput(emailOnlySchema, formData);
    await requestPasswordReset(input.email);
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
    await resendConfirmation(input.email);
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
    await changePassword(input.currentPassword, input.password);
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
