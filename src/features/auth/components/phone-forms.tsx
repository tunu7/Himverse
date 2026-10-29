"use client";

import { useActionState, useEffect, useState } from "react";

import { CaptchaField } from "@/components/captcha-field";
import {
  buttonClass,
  FieldError,
  fieldErrorsOf,
  FormAlert,
  inputClass,
  secondaryButtonClass,
} from "@/components/form-feedback";
import { PendingLabel } from "@/components/ui";
import { getPublicEnv } from "@/lib/env";
import { DEFAULT_PHONE_COUNTRY, PHONE_COUNTRIES, type PhoneCountryCode } from "@/lib/phone";

import {
  confirmPhoneLinkAction,
  type PhoneCodeSentResult,
  type PhoneLinkedResult,
  sendSignInCodeAction,
  startPhoneLinkAction,
  verifySignInCodeAction,
} from "../actions";

/** Matches the server's 60-second cooldown per number (ADR-0011). */
const RESEND_SECONDS = 60;

function phoneSignInEnabled(): boolean {
  return getPublicEnv().NEXT_PUBLIC_AUTH_PHONE_ENABLED === "true";
}

/** Seconds until "send a new code" is allowed, counting from each new `start`. */
function useCountdown(start: unknown): number {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!start) return;
    const until = Date.now() + RESEND_SECONDS * 1000;
    const tick = () => setLeft(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [start]);
  return left;
}

function NumberFields({
  country,
  phone,
  onCountry,
  onPhone,
  errors,
}: {
  country: PhoneCountryCode;
  phone: string;
  onCountry: (c: PhoneCountryCode) => void;
  onPhone: (p: string) => void;
  errors: (field: string) => readonly string[] | undefined;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,11rem)_1fr]">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-fg">Country</span>
        <select
          name="country"
          value={country}
          onChange={(e) => onCountry(e.target.value as PhoneCountryCode)}
          autoComplete="tel-country-code"
          className={inputClass}
        >
          {PHONE_COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name} (+{c.dial})
            </option>
          ))}
        </select>
        <FieldError errors={errors("country")} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-fg">Mobile number</span>
        <input
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          required
          maxLength={32}
          value={phone}
          onChange={(e) => onPhone(e.target.value)}
          className={inputClass}
        />
        <FieldError errors={errors("phone")} />
      </label>
    </div>
  );
}

function CodeField({ errors }: { errors: readonly string[] | undefined }) {
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
        className={inputClass}
      />
      <FieldError errors={errors} />
    </label>
  );
}

/**
 * "Use your mobile number": texts a code, then checks it. Signing in and
 * signing up are the same; on the sign-up page the chosen account type applies
 * to a new account only.
 */
export function PhoneSignIn({
  next,
  accountType,
}: {
  next: string;
  accountType?: "traveller" | "partner";
}) {
  const [sent, send, sending] = useActionState<PhoneCodeSentResult, FormData>(
    sendSignInCodeAction,
    null,
  );
  const [verified, verify, verifying] = useActionState(verifySignInCodeAction, null);
  const [country, setCountry] = useState<PhoneCountryCode>(DEFAULT_PHONE_COUNTRY);
  const [phone, setPhone] = useState("");
  // Reset to step 1 ("use a different number") by ignoring the last send.
  const [restarted, setRestarted] = useState<PhoneCodeSentResult>(null);
  const codeSent = sent?.ok && sent !== restarted ? sent.data.phone : null;
  const resendIn = useCountdown(codeSent ? sent : null);
  const sendErrors = (field: string) => fieldErrorsOf(sent, field);

  if (!phoneSignInEnabled()) return null;

  const sendForm = (label: string, compact: boolean) => (
    <form action={send} className="flex flex-col gap-3" noValidate>
      {accountType ? <input type="hidden" name="accountType" value={accountType} /> : null}
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {compact ? (
        <>
          <input type="hidden" name="country" value={country} />
          <input type="hidden" name="phone" value={phone} />
        </>
      ) : (
        <NumberFields
          country={country}
          phone={phone}
          onCountry={setCountry}
          onPhone={setPhone}
          errors={sendErrors}
        />
      )}
      <CaptchaField resetKey={sent} />
      {compact ? null : <FormAlert state={sent} />}
      <button
        type="submit"
        disabled={sending || (compact && resendIn > 0)}
        className={compact ? `${secondaryButtonClass} self-start` : `${buttonClass} w-full py-3`}
      >
        <PendingLabel
          pending={sending}
          busy="Sending code…"
          idle={compact && resendIn > 0 ? `Send a new code in ${resendIn}s` : label}
        />
      </button>
    </form>
  );

  return (
    <details className="group rounded-2xl border border-line p-4" data-testid="phone-sign-in">
      <summary className="cursor-pointer text-sm font-medium text-fg">
        Use your mobile number instead
      </summary>
      <div className="mt-4 flex flex-col gap-4">
        {codeSent ? (
          <>
            <p role="status" className="text-sm text-fg-soft">
              We&apos;ve texted a 6-digit code to <strong>{codeSent}</strong>. It expires in a few
              minutes.
            </p>
            <form action={verify} className="flex flex-col gap-3" noValidate>
              <input type="hidden" name="phone" value={codeSent} />
              {next ? <input type="hidden" name="next" value={next} /> : null}
              <CodeField errors={fieldErrorsOf(verified, "code")} />
              <FormAlert state={verified} />
              <button type="submit" disabled={verifying} className={`${buttonClass} w-full py-3`}>
                <PendingLabel pending={verifying} busy="Checking…" idle="Continue" />
              </button>
            </form>
            {sendForm("Send a new code", true)}
            {sent && !sent.ok ? <FormAlert state={sent} /> : null}
            <button
              type="button"
              onClick={() => setRestarted(sent)}
              className="self-start text-sm font-medium text-accent underline-offset-4 hover:underline"
            >
              Use a different number
            </button>
          </>
        ) : (
          <>
            {sendForm("Text me a code", false)}
            <p className="text-xs text-subtle">
              Standard SMS rates may apply. A new number creates an account.
            </p>
          </>
        )}
      </div>
    </details>
  );
}

/** Account settings: add or change the mobile number (a code to the new number confirms it). */
export function PhoneLinkForm({ current }: { current: string | null }) {
  const [started, start, starting] = useActionState<PhoneLinkedResult, FormData>(
    startPhoneLinkAction,
    null,
  );
  const [confirmed, confirm, confirming] = useActionState<PhoneLinkedResult, FormData>(
    confirmPhoneLinkAction,
    null,
  );
  const [country, setCountry] = useState<PhoneCountryCode>(DEFAULT_PHONE_COUNTRY);
  const [phone, setPhone] = useState("");
  const linked = confirmed?.ok ? confirmed.data.phone : null;
  const pending = started?.ok && !linked ? started.data.phone : null;

  if (!phoneSignInEnabled()) return null;

  return (
    <div className="flex flex-col gap-3" data-testid="phone-link">
      <p className="text-sm text-fg-soft">
        Mobile number for signing in:{" "}
        <span className="font-medium text-fg">{linked ?? current ?? "not added"}</span>
      </p>
      {linked ? (
        <p role="status" className="text-sm text-accent-soft-fg">
          Number confirmed. You can now sign in with it.
        </p>
      ) : pending ? (
        <form action={confirm} className="flex flex-col gap-3" noValidate>
          <p className="text-sm text-fg-soft">
            Enter the code we texted to <strong>{pending}</strong>.
          </p>
          <input type="hidden" name="phone" value={pending} />
          <CodeField errors={fieldErrorsOf(confirmed, "code")} />
          <FormAlert state={confirmed} />
          <button type="submit" disabled={confirming} className={`${buttonClass} self-start`}>
            <PendingLabel pending={confirming} busy="Checking…" idle="Confirm number" />
          </button>
        </form>
      ) : (
        <form action={start} className="flex flex-col gap-3" noValidate>
          <NumberFields
            country={country}
            phone={phone}
            onCountry={setCountry}
            onPhone={setPhone}
            errors={(field) => fieldErrorsOf(started, field)}
          />
          <FormAlert state={started} />
          <button
            type="submit"
            disabled={starting}
            className={`${secondaryButtonClass} self-start`}
          >
            <PendingLabel
              pending={starting}
              busy="Sending code…"
              idle={current ? "Change number" : "Add number"}
            />
          </button>
        </form>
      )}
    </div>
  );
}
