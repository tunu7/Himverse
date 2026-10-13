"use client";

import { useActionState } from "react";

import {
  buttonClass,
  FieldError,
  fieldErrorsOf,
  FormAlert,
  inputClass,
} from "@/components/form-feedback";

import { updateProfile } from "../actions";
import { PendingLabel } from "@/components/ui";

export function ProfileForm({ displayName }: { displayName: string }) {
  const [state, action, pending] = useActionState(updateProfile, null);
  return (
    <form action={action} className="flex max-w-md flex-col gap-3" noValidate>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Display name</span>
        <input
          name="displayName"
          defaultValue={displayName}
          required
          maxLength={80}
          className={inputClass}
        />
        <FieldError errors={fieldErrorsOf(state, "displayName")} />
      </label>
      <FormAlert state={state} successMessage="Saved." />
      <button type="submit" disabled={pending} className={`${buttonClass} self-start`}>
        <PendingLabel pending={pending} busy="Saving…" idle="Save" />
      </button>
    </form>
  );
}
