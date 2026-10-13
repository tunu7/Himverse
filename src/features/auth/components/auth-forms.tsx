"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  buttonClass,
  FieldError,
  fieldErrorsOf,
  FormAlert,
  inputClass,
} from "@/components/form-feedback";

import { signIn, signUp } from "../actions";
import { PendingLabel } from "@/components/ui";

export function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signIn, null);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-fg">Email</span>
        <input name="email" type="email" autoComplete="email" required className={inputClass} />
        <FieldError errors={fieldErrorsOf(state, "email")} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-fg">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
        <FieldError errors={fieldErrorsOf(state, "password")} />
      </label>
      <FormAlert state={state} />
      <button type="submit" disabled={pending} className={`${buttonClass} w-full py-3`}>
        <PendingLabel pending={pending} busy="Signing in…" idle="Sign in" />
      </button>
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

export function SignUpForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signUp, null);
  if (state?.ok) {
    return (
      <p role="status" className="text-fg-soft">
        Check your email to confirm your account, then sign in.
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
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
        <input name="email" type="email" autoComplete="email" required className={inputClass} />
        <FieldError errors={fieldErrorsOf(state, "email")} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-fg">Password (at least 8 characters)</span>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={72}
          className={inputClass}
        />
        <FieldError errors={fieldErrorsOf(state, "password")} />
      </label>
      <FormAlert state={state} />
      <button type="submit" disabled={pending} className={`${buttonClass} w-full py-3`}>
        <PendingLabel pending={pending} busy="Creating account…" idle="Create account" />
      </button>
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
