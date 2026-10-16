"use client";

import { useActionState, useEffect, useState } from "react";

import {
  buttonClass,
  FieldError,
  fieldErrorsOf,
  FormAlert,
  inputClass,
  secondaryButtonClass,
} from "@/components/form-feedback";
import { CaptchaField } from "@/components/captcha-field";
import { PasswordField } from "@/components/password-field";
import { PendingLabel } from "@/components/ui";

import {
  changePasswordAction,
  completePasswordResetAction,
  type EmailSentResult,
  type PasswordResult,
  requestPasswordResetAction,
  resendConfirmationAction,
} from "../actions";

/** "Forgot password": asks for the email, then shows the same message either way. */
export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, null);
  if (state?.ok) {
    return (
      <p role="status" className="rounded-2xl bg-accent-soft p-4 text-sm text-accent-soft-fg">
        If an account uses that email, we&apos;ve sent a link to reset the password. Open it in{" "}
        <strong>this browser</strong> within an hour. Check your spam folder if it doesn&apos;t
        arrive.
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-fg">Email</span>
        <input name="email" type="email" autoComplete="email" required className={inputClass} />
        <FieldError errors={fieldErrorsOf(state, "email")} />
      </label>
      <CaptchaField resetKey={state} />
      <FormAlert state={state} />
      <button type="submit" disabled={pending} className={`${buttonClass} w-full py-3`}>
        <PendingLabel pending={pending} busy="Sending…" idle="Send reset link" />
      </button>
    </form>
  );
}

/** Sets a new password from a reset link. */
export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(completePasswordResetAction, null);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <PasswordField
        name="password"
        label="New password (at least 8 characters)"
        autoComplete="new-password"
        minLength={8}
        showStrength
      />
      <FieldError errors={fieldErrorsOf(state, "password")} />
      <PasswordField
        name="confirmPassword"
        label="Repeat new password"
        autoComplete="new-password"
      />
      <FieldError errors={fieldErrorsOf(state, "confirmPassword")} />
      <FormAlert state={state} />
      <button type="submit" disabled={pending} className={`${buttonClass} w-full py-3`}>
        <PendingLabel pending={pending} busy="Saving…" idle="Set new password" />
      </button>
    </form>
  );
}

/** Account settings: change password. Other sessions are signed out on success. */
export function ChangePasswordForm() {
  // Counts successful changes, so the form remounts empty after each one.
  const [{ result: state, changes }, action, pending] = useActionState(
    async (prev: { result: PasswordResult; changes: number }, formData: FormData) => {
      const result = await changePasswordAction(prev.result, formData);
      return { result, changes: prev.changes + (result?.ok ? 1 : 0) };
    },
    { result: null, changes: 0 },
  );
  return (
    <form key={changes} action={action} className="flex flex-col gap-3" noValidate>
      <PasswordField
        name="currentPassword"
        label="Current password"
        autoComplete="current-password"
      />
      <FieldError errors={fieldErrorsOf(state, "currentPassword")} />
      <PasswordField
        name="password"
        label="New password"
        autoComplete="new-password"
        minLength={8}
        showStrength
      />
      <FieldError errors={fieldErrorsOf(state, "password")} />
      <PasswordField
        name="confirmPassword"
        label="Repeat new password"
        autoComplete="new-password"
      />
      <FieldError errors={fieldErrorsOf(state, "confirmPassword")} />
      <CaptchaField resetKey={state} />
      <FormAlert
        state={state}
        successMessage="Password changed. Other devices have been signed out."
      />
      <button type="submit" disabled={pending} className={`${secondaryButtonClass} self-start`}>
        <PendingLabel pending={pending} busy="Changing…" idle="Change password" />
      </button>
    </form>
  );
}

const RESEND_COOLDOWN_SECONDS = 60;

/** "Resend confirmation email" with a cooldown, for an address the visitor typed. */
export function ResendConfirmation({ email }: { email: string }) {
  const [{ result: state, sentAt }, action, pending] = useActionState(
    async (prev: { result: EmailSentResult; sentAt: number }, formData: FormData) => {
      const result = await resendConfirmationAction(prev.result, formData);
      return { result, sentAt: result?.ok ? Date.now() : prev.sentAt };
    },
    { result: null, sentAt: 0 },
  );
  const [now, setNow] = useState(() => Date.now());
  // Tick only while a cooldown is running.
  useEffect(() => {
    if (!sentAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [sentAt]);
  const wait = sentAt
    ? Math.min(
        RESEND_COOLDOWN_SECONDS,
        Math.max(0, RESEND_COOLDOWN_SECONDS - Math.floor((now - sentAt) / 1000)),
      )
    : 0;
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="email" value={email} />
      <CaptchaField resetKey={state} />
      <button
        type="submit"
        disabled={pending || wait > 0}
        className={`${secondaryButtonClass} self-start`}
      >
        {wait > 0 ? (
          `Resend in ${wait}s`
        ) : (
          <PendingLabel pending={pending} busy="Sending…" idle="Resend confirmation email" />
        )}
      </button>
      <FormAlert
        state={state}
        successMessage="If that address is waiting for confirmation, we've sent a new link."
      />
    </form>
  );
}
