"use client";

import { useActionState } from "react";

import {
  buttonClass,
  FieldError,
  fieldErrorsOf,
  FormAlert,
  inputClass,
} from "@/components/form-feedback";
import { formatCategory } from "@/lib/format";
import { EXPERIENCE_CATEGORIES } from "@/lib/catalog-options";
import { MAX_NOTES_LENGTH, MAX_TRIP_DAYS, PACES } from "@/lib/itinerary-options";

import { createItinerary } from "../actions";

export function PreferencesForm({
  districts,
  destinations,
  minDate,
}: {
  districts: readonly string[];
  destinations: ReadonlyArray<{ slug: string; name: string }>;
  minDate: string;
}) {
  const [state, action, pending] = useActionState(createItinerary, null);
  const errors = (field: string) => fieldErrorsOf(state, field);

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-6" noValidate>
      <input type="hidden" name="currency" value="INR" />

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 font-semibold">Where and when</legend>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-sm font-medium">Where would you like to go?</span>
          <select name="place" defaultValue="" className={inputClass}>
            <option value="">Anywhere in Arunachal Pradesh</option>
            <optgroup label="Regions">
              {districts.map((d) => (
                <option key={d} value={`district:${d}`}>
                  {d}
                </option>
              ))}
            </optgroup>
            <optgroup label="Destinations">
              {destinations.map((d) => (
                <option key={d.slug} value={`destination:${d.slug}`}>
                  {d.name}
                </option>
              ))}
            </optgroup>
          </select>
          <FieldError errors={errors("place")} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Start date</span>
          <input type="date" name="startDate" min={minDate} required className={inputClass} />
          <FieldError errors={errors("startDate")} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Number of days</span>
          <input
            type="number"
            name="durationDays"
            min={1}
            max={MAX_TRIP_DAYS}
            defaultValue={3}
            required
            className={inputClass}
          />
          <FieldError errors={errors("durationDays")} />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-sm font-medium">Travelling from (optional)</span>
          <input name="origin" maxLength={100} placeholder="e.g. Guwahati" className={inputClass} />
          <FieldError errors={errors("origin")} />
        </label>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-2 font-semibold">Who and budget</legend>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Adults</span>
          <input
            type="number"
            name="adults"
            min={1}
            max={12}
            defaultValue={2}
            required
            className={inputClass}
          />
          <FieldError errors={errors("adults")} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Children</span>
          <input
            type="number"
            name="children"
            min={0}
            max={11}
            defaultValue={0}
            className={inputClass}
          />
          <FieldError errors={errors("children")} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Budget for experiences (₹, optional)</span>
          <input type="number" name="budgetRupees" min={0} step={1} className={inputClass} />
          <FieldError errors={errors("budgetRupees") ?? errors("currency")} />
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-semibold">Interests and pace</legend>
        <div className="flex flex-wrap gap-3">
          {EXPERIENCE_CATEGORIES.map((c) => (
            <label key={c} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="interests" value={c} />
              {formatCategory(c)}
            </label>
          ))}
        </div>
        <FieldError errors={errors("interests")} />
        <label className="flex flex-col gap-1 sm:max-w-xs">
          <span className="text-sm font-medium">Pace</span>
          <select name="pace" defaultValue="moderate" className={inputClass}>
            {Object.entries(PACES).map(([key, pace]) => (
              <option key={key} value={key}>
                {pace.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="limitedMobility" />
          Someone in the group has limited mobility
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Anything else? (optional)</span>
          <textarea name="notes" rows={3} maxLength={MAX_NOTES_LENGTH} className={inputClass} />
          <span className="text-xs text-zinc-500">
            Shared with our AI planner. Please don&apos;t include names, phone numbers or other
            personal details.
          </span>
          <FieldError errors={errors("notes")} />
        </label>
      </fieldset>

      <FormAlert state={state} />
      <button type="submit" disabled={pending} className={`${buttonClass} self-start`}>
        {pending ? "Planning your trip… this can take up to a minute" : "Plan my trip"}
      </button>
    </form>
  );
}
