"use client";

import { useActionState } from "react";

import {
  FieldError,
  fieldErrorsOf,
  FormAlert,
  inputClass,
  secondaryButtonClass,
} from "@/components/form-feedback";
import type { ReviewDecision } from "@/server/providers/status";

import { reviewProviderAction } from "../actions";

const DECISION_LABELS: Record<ReviewDecision, string> = {
  verified: "Verify",
  rejected: "Request changes",
  suspended: "Suspend",
};

export function ReviewProviderForm({
  providerId,
  decisions,
}: {
  providerId: string;
  decisions: readonly ReviewDecision[];
}) {
  const [state, action, pending] = useActionState(reviewProviderAction, null);
  if (decisions.length === 0) {
    return null;
  }
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="providerId" value={providerId} />
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">
          Note (required to reject or suspend; shown to the provider)
        </span>
        <textarea name="note" rows={2} maxLength={1000} className={inputClass} />
        <FieldError errors={fieldErrorsOf(state, "note")} />
      </label>
      <div className="flex flex-wrap gap-2">
        {decisions.map((decision) => (
          <button
            key={decision}
            type="submit"
            name="decision"
            value={decision}
            disabled={pending}
            className={secondaryButtonClass}
          >
            {DECISION_LABELS[decision]}
          </button>
        ))}
      </div>
      <FormAlert state={state} successMessage="Decision recorded." />
    </form>
  );
}
