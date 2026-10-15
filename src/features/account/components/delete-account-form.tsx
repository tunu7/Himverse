"use client";

import { useActionState } from "react";

import { FieldError, fieldErrorsOf, FormAlert, inputClass } from "@/components/form-feedback";
import { PendingLabel } from "@/components/ui";

import { deleteAccount } from "../actions";

/** Permanent deletion, behind a disclosure, a fresh sign-in and typing "DELETE". */
export function DeleteAccountForm({
  reauth,
  accountType,
}: {
  /** From the server: authenticator code, password, or a recent Google sign-in. */
  reauth: "code" | "password" | "recent-sign-in";
  accountType: "traveller" | "partner";
}) {
  const [state, action, pending] = useActionState(deleteAccount, null);
  return (
    <details className="group rounded-2xl border border-danger/40 bg-surface p-6">
      <summary className="cursor-pointer text-lg font-semibold text-danger">Delete account</summary>
      <div className="mt-4 flex flex-col gap-4">
        <ul className="list-disc pl-5 text-sm text-fg-soft">
          <li>Your sign-in, profile and saved itineraries are deleted permanently.</li>
          {accountType === "traveller" ? (
            <>
              <li>
                Open booking requests and upcoming bookings are cancelled, and partners are told
                why.
              </li>
              <li>
                Partners keep a record of past bookings without your name, phone number, messages or
                pickup details.
              </li>
            </>
          ) : (
            <li>
              Your business and its listings stay with your other team members. If you&apos;re the
              only member, answer or cancel open bookings first.
            </li>
          )}
          <li>This can&apos;t be undone.</li>
        </ul>
        <form action={action} className="flex max-w-md flex-col gap-3" noValidate>
          {reauth === "code" ? (
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">6-digit code from your authenticator app</span>
              <input
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                className={inputClass}
              />
              <FieldError errors={fieldErrorsOf(state, "code")} />
            </label>
          ) : reauth === "password" ? (
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Your password</span>
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                maxLength={72}
                required
                className={inputClass}
              />
              <FieldError errors={fieldErrorsOf(state, "password")} />
            </label>
          ) : (
            <p className="text-sm text-muted">
              You sign in with Google. If you signed in more than 15 minutes ago, sign out and in
              again first.
            </p>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Type DELETE to confirm</span>
            <input
              name="confirm"
              autoComplete="off"
              maxLength={10}
              required
              className={inputClass}
            />
            <FieldError errors={fieldErrorsOf(state, "confirm")} />
          </label>
          <FormAlert state={state} />
          <button
            type="submit"
            disabled={pending}
            className="self-start rounded-full bg-danger px-5 py-2.5 text-sm font-semibold text-canvas transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger disabled:opacity-60"
          >
            <PendingLabel pending={pending} busy="Deleting…" idle="Delete my account" />
          </button>
        </form>
      </div>
    </details>
  );
}
