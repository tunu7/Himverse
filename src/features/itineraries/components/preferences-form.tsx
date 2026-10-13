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
import { PendingLabel } from "@/components/ui";

import { PlanningProgress } from "./planning-progress";

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
    <form action={action} className="flex flex-col gap-6" noValidate aria-busy={pending}>
      <input type="hidden" name="currency" value="INR" />

      <fieldset
        disabled={pending}
        className="grid gap-4 rounded-2xl border border-line bg-surface p-5 disabled:opacity-60 sm:p-6 sm:grid-cols-2"
      >
        <legend className="mb-4 flex items-center gap-2 text-base font-semibold text-fg">
          <span className="flex size-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-on-accent">
            1
          </span>
          Where and when
        </legend>
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

      <fieldset
        disabled={pending}
        className="grid gap-4 rounded-2xl border border-line bg-surface p-5 disabled:opacity-60 sm:p-6 sm:grid-cols-3"
      >
        <legend className="mb-4 flex items-center gap-2 text-base font-semibold text-fg">
          <span className="flex size-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-on-accent">
            2
          </span>
          Who and budget
        </legend>
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

      <fieldset
        disabled={pending}
        className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 disabled:opacity-60 sm:p-6"
      >
        <legend className="mb-4 flex items-center gap-2 text-base font-semibold text-fg">
          <span className="flex size-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-on-accent">
            3
          </span>
          Interests and pace
        </legend>
        <p className="text-sm text-muted">What do you enjoy? Pick any (or none for a mix).</p>
        <div className="flex flex-wrap gap-2">
          {EXPERIENCE_CATEGORIES.map((c) => (
            <label
              key={c}
              className="flex cursor-pointer items-center gap-2 rounded-full border border-line-strong bg-surface px-3.5 py-1.5 text-sm font-medium text-fg-soft transition hover:border-accent/50 has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent-soft-fg"
            >
              <input
                type="checkbox"
                name="interests"
                value={c}
                className="size-4 accent-[var(--accent)]"
              />
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
        <label className="flex items-center gap-2 text-sm text-fg-soft">
          <input type="checkbox" name="limitedMobility" className="size-4 accent-[var(--accent)]" />
          Someone in the group has limited mobility
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Anything else? (optional)</span>
          <textarea name="notes" rows={3} maxLength={MAX_NOTES_LENGTH} className={inputClass} />
          <span className="text-xs text-subtle">
            Shared with our AI planner. Please don&apos;t include names, phone numbers or other
            personal details.
          </span>
          <FieldError errors={errors("notes")} />
        </label>
      </fieldset>

      <FormAlert state={state} />
      {pending ? <PlanningProgress /> : null}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={`${buttonClass} px-6 py-3 text-base`}>
          <PendingLabel
            pending={pending}
            busy="Planning your trip… this can take up to a minute"
            idle="Plan my trip"
          />
        </button>
        {pending ? null : (
          <p className="text-sm text-subtle">Free · takes about a minute · nothing is booked</p>
        )}
      </div>
    </form>
  );
}
