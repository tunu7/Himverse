"use client";

import { useActionState } from "react";

import {
  buttonClass,
  FieldError,
  fieldErrorsOf,
  FormAlert,
  inputClass,
  secondaryButtonClass,
} from "@/components/form-feedback";
import { PendingLabel } from "@/components/ui";

import { recordPayoutAction, setDepositsRequiredAction } from "../actions";

/** Turns required deposits on or off. Disabled until the Razorpay keys are set. */
export function DepositsSwitch({
  required,
  configured,
}: {
  required: boolean;
  configured: boolean;
}) {
  const [state, action, pending] = useActionState(setDepositsRequiredAction, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="required" value={required ? "false" : "true"} />
      <button
        type="submit"
        disabled={pending || (!required && !configured)}
        className={`${required ? secondaryButtonClass : buttonClass} self-start`}
      >
        <PendingLabel
          pending={pending}
          busy="Saving…"
          idle={required ? "Stop requiring deposits" : "Require deposits"}
        />
      </button>
      <FormAlert state={state} successMessage="Saved." />
    </form>
  );
}

/** Records a bank transfer made to a partner, up to what they're owed. */
export function PayoutForm({ providerId, name }: { providerId: string; name: string }) {
  const [state, action, pending] = useActionState(recordPayoutAction, null);
  const errors = (field: string) => fieldErrorsOf(state, field);
  return (
    <form action={action} className="flex flex-col gap-2" aria-label={`Record payout to ${name}`}>
      <input type="hidden" name="providerId" value={providerId} />
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium">Amount paid (₹)</span>
          <input name="amountRupees" inputMode="decimal" required className={inputClass} />
          <FieldError errors={errors("amountRupees")} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium">Bank reference (UTR)</span>
          <input name="reference" required maxLength={100} className={inputClass} />
          <FieldError errors={errors("reference")} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium">Note (optional)</span>
          <input name="note" maxLength={300} className={inputClass} />
        </label>
      </div>
      <FormAlert state={state} successMessage="Payout recorded." />
      <button type="submit" disabled={pending} className={`${secondaryButtonClass} self-start`}>
        <PendingLabel pending={pending} busy="Recording…" idle="Record payout" />
      </button>
    </form>
  );
}
