"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import {
  buttonClass,
  FieldError,
  fieldErrorsOf,
  FormAlert,
  inputClass,
} from "@/components/form-feedback";

import { CaptchaField } from "@/components/captcha-field";
import { PasswordField } from "@/components/password-field";
import { PendingLabel } from "@/components/ui";

import { signIn, signUp } from "../actions";
import { EMAIL_NOT_CONFIRMED_MESSAGE } from "../schemas";
import { ResendConfirmation } from "./password-forms";

export function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signIn, null);
  // Kept across submissions (React resets the form) so "resend" knows the address.
  const [email, setEmail] = useState("");
  const unconfirmed = state && !state.ok && state.error.message === EMAIL_NOT_CONFIRMED_MESSAGE;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-fg">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
        <FieldError errors={fieldErrorsOf(state, "email")} />
      </label>
      <div className="flex flex-col gap-1">
        <PasswordField name="password" label="Password" autoComplete="current-password" />
        <FieldError errors={fieldErrorsOf(state, "password")} />
        <Link
          href="/forgot-password"
          className="self-end text-sm font-medium text-accent underline-offset-4 hover:underline"
        >
          Forgot password?
        </Link>
      </div>
      <CaptchaField resetKey={state} />
      <FormAlert state={state} />
      <button type="submit" disabled={pending} className={`${buttonClass} w-full py-3`}>
        <PendingLabel pending={pending} busy="Signing in…" idle="Sign in" />
      </button>
      {unconfirmed && email ? <ResendConfirmation email={email} /> : null}
      <div className="flex flex-col gap-1 border-t border-line pt-4 text-sm text-muted">
        <p>
          New here?{" "}
          <Link
            href={next ? `/sign-up?next=${encodeURIComponent(next)}` : "/sign-up"}
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            Create an account
          </Link>
        </p>
        <p>
          Run a tourism business?{" "}
          <Link
            href="/sign-up?as=partner"
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            List your experiences
          </Link>
        </p>
      </div>
    </form>
  );
}

export function SignUpForm({
  next,
  accountType,
}: {
  next: string;
  accountType: "traveller" | "partner";
}) {
  const [state, action, pending] = useActionState(signUp, null);
  const [email, setEmail] = useState("");
  if (state?.ok) {
    return (
      <div role="status" className="flex flex-col gap-4" data-testid="check-email">
        <h2 className="text-xl font-semibold text-fg">Check your email</h2>
        <p className="text-fg-soft">
          We&apos;ve sent a confirmation link to <strong>{email}</strong>. Open it to activate your
          account, then sign in. It can take a minute; check your spam folder too.
        </p>
        <ResendConfirmation email={email} />
        <Link
          href="/sign-in"
          className="self-start text-sm font-medium text-accent underline-offset-4 hover:underline"
        >
          Go to sign in
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <input type="hidden" name="accountType" value={accountType} />
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-fg">Your name</span>
        <input
          name="displayName"
          autoComplete="name"
          required
          maxLength={80}
          className={inputClass}
        />
        <FieldError errors={fieldErrorsOf(state, "displayName")} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-fg">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
        <FieldError errors={fieldErrorsOf(state, "email")} />
      </label>
      <div className="flex flex-col gap-1">
        <PasswordField
          name="password"
          label="Password (at least 8 characters)"
          autoComplete="new-password"
          minLength={8}
          showStrength
        />
        <FieldError errors={fieldErrorsOf(state, "password")} />
      </div>
      <CaptchaField resetKey={state} />
      <FormAlert state={state} />
      <button type="submit" disabled={pending} className={`${buttonClass} w-full py-3`}>
        <PendingLabel pending={pending} busy="Creating account…" idle="Create account" />
      </button>
      <p className="text-xs text-subtle">
        By creating an account you agree to the{" "}
        <Link href="/terms" className="underline underline-offset-4 hover:text-fg">
          terms of use
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline underline-offset-4 hover:text-fg">
          privacy policy
        </Link>
        .
      </p>
      <p className="text-sm text-muted">
        Already have an account?{" "}
        <Link
          href={next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in"}
          className="font-medium text-accent underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
