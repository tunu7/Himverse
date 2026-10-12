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

export function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signIn, null);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Email</span>
        <input name="email" type="email" autoComplete="email" required className={inputClass} />
        <FieldError errors={fieldErrorsOf(state, "email")} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Password</span>
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
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        New here?{" "}
        <Link href={`/sign-up?next=${encodeURIComponent(next)}`} className="underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}

export function SignUpForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signUp, null);
  if (state?.ok) {
    return (
      <p role="status" className="text-zinc-700 dark:text-zinc-300">
        Check your email to confirm your account, then sign in.
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Your name</span>
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
        <span className="text-sm font-medium">Email</span>
        <input name="email" type="email" autoComplete="email" required className={inputClass} />
        <FieldError errors={fieldErrorsOf(state, "email")} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Password (at least 8 characters)</span>
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
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Creating account…" : "Create account"}
      </button>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Already have an account?{" "}
        <Link href={`/sign-in?next=${encodeURIComponent(next)}`} className="underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
