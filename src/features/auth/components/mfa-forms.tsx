"use client";

import { useActionState } from "react";

import {
  buttonClass,
  FieldError,
  fieldErrorsOf,
  FormAlert,
  inputClass,
} from "@/components/form-feedback";
import { PendingLabel } from "@/components/ui";

import {
  confirmTotpEnrollmentAction,
  startTotpEnrollmentAction,
  verifySecondStepAction,
} from "../actions";

function CodeInput({ errors }: { errors: readonly string[] | undefined }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium text-fg">6-digit code</span>
      <input
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]*"
        maxLength={7}
        required
        className={`${inputClass} text-center font-mono text-xl tracking-[0.4em]`}
      />
      <FieldError errors={errors} />
    </label>
  );
}

/** Two-step setup: show the QR code (and secret), then confirm with a first code. */
export function TotpSetup({ next }: { next: string }) {
  const [enrollment, start, starting] = useActionState(startTotpEnrollmentAction, null);
  const [state, confirm, confirming] = useActionState(confirmTotpEnrollmentAction, null);

  if (!enrollment?.ok) {
    return (
      <form action={start} className="flex flex-col gap-4">
        <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-fg-soft">
          <li>
            Install an authenticator app on your phone (Google Authenticator, Microsoft
            Authenticator, 1Password, Authy…).
          </li>
          <li>Scan the QR code we show you next.</li>
          <li>Enter the 6-digit code the app shows.</li>
        </ol>
        <FormAlert state={enrollment} />
        <button type="submit" disabled={starting} className={`${buttonClass} w-full py-3`}>
          <PendingLabel pending={starting} busy="Preparing…" idle="Set up authenticator app" />
        </button>
      </form>
    );
  }

  const { factorId, qrCode, secret } = enrollment.data;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-white p-5">
        {/* eslint-disable-next-line @next/next/no-img-element -- an SVG data URL from Supabase Auth, not a remote image */}
        <img src={qrCode} alt="QR code for your authenticator app" width={180} height={180} />
      </div>
      <details className="text-sm text-muted">
        <summary className="cursor-pointer font-medium text-fg">
          Can&apos;t scan? Enter this key
        </summary>
        <code
          className="mt-2 block rounded-xl bg-surface-muted p-3 font-mono text-sm break-all text-fg"
          data-testid="totp-secret"
        >
          {secret}
        </code>
      </details>
      <form action={confirm} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="factorId" value={factorId} />
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <CodeInput errors={fieldErrorsOf(state, "code")} />
        <FormAlert state={state} />
        <button type="submit" disabled={confirming} className={`${buttonClass} w-full py-3`}>
          <PendingLabel pending={confirming} busy="Checking…" idle="Turn on two-step login" />
        </button>
      </form>
    </div>
  );
}

/** The second step at sign-in. */
export function SecondStepForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(verifySecondStepAction, null);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <CodeInput errors={fieldErrorsOf(state, "code")} />
      <FormAlert state={state} />
      <button type="submit" disabled={pending} className={`${buttonClass} w-full py-3`}>
        <PendingLabel pending={pending} busy="Checking…" idle="Verify" />
      </button>
    </form>
  );
}
