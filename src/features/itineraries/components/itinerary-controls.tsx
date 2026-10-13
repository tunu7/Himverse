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
import { PACES } from "@/lib/itinerary-options";

import {
  makeVersionCurrent,
  refineItinerary,
  regenerateItinerary,
  removeItinerary,
} from "../actions";
import { PendingLabel } from "@/components/ui";

import { PlanningProgress } from "./planning-progress";

export function RefineForm({ itineraryId }: { itineraryId: string }) {
  const [state, action, pending] = useActionState(refineItinerary, null);
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="itineraryId" value={itineraryId} />
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">What would you like to change?</span>
        <textarea
          name="request"
          rows={3}
          maxLength={500}
          placeholder="e.g. less driving, add a food experience, keep day 2 free"
          className={inputClass}
        />
        <FieldError errors={fieldErrorsOf(state, "request")} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Change pace (optional)</span>
          <select name="pace" defaultValue="" className={inputClass}>
            <option value="">Keep current pace</option>
            {Object.entries(PACES).map(([key, pace]) => (
              <option key={key} value={key}>
                {pace.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">New budget (₹, optional)</span>
          <input type="number" name="budgetRupees" min={0} className={inputClass} />
          <FieldError errors={fieldErrorsOf(state, "budgetRupees")} />
        </label>
      </div>
      <FormAlert state={state} successMessage="Saved as a new version." />
      {pending ? <PlanningProgress /> : null}
      <button type="submit" disabled={pending} className={`${buttonClass} self-start`}>
        <PendingLabel pending={pending} busy="Refining…" idle="Refine itinerary" />
      </button>
    </form>
  );
}

export function RegenerateButton({ itineraryId }: { itineraryId: string }) {
  const [state, action, pending] = useActionState(regenerateItinerary, null);
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="itineraryId" value={itineraryId} />
      <button type="submit" disabled={pending} className={secondaryButtonClass}>
        <PendingLabel pending={pending} busy="Regenerating…" idle="Regenerate" />
      </button>
      {pending ? <PlanningProgress /> : null}
      <FormAlert state={state} />
    </form>
  );
}

export function MakeCurrentButton({
  itineraryId,
  version,
}: {
  itineraryId: string;
  version: number;
}) {
  const [state, action, pending] = useActionState(makeVersionCurrent, null);
  return (
    <form action={action} className="inline-flex flex-col gap-1">
      <input type="hidden" name="itineraryId" value={itineraryId} />
      <input type="hidden" name="version" value={version} />
      <button type="submit" disabled={pending} className={secondaryButtonClass}>
        Use version {version}
      </button>
      <FormAlert state={state} />
    </form>
  );
}

export function DeleteItineraryButton({ itineraryId }: { itineraryId: string }) {
  const [state, action, pending] = useActionState(removeItinerary, null);
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm("Delete this itinerary and all its versions?")) event.preventDefault();
      }}
      className="flex flex-col gap-1"
    >
      <input type="hidden" name="itineraryId" value={itineraryId} />
      <button type="submit" disabled={pending} className={secondaryButtonClass}>
        Delete itinerary
      </button>
      <FormAlert state={state} />
    </form>
  );
}
