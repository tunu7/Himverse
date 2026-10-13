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
import type { PublicDestination } from "@/server/catalog/catalog";

import {
  addExperience,
  applyAsProvider,
  changeExperienceStatus,
  submitForReview,
} from "../actions";
import { EXPERIENCE_CATEGORIES } from "../schemas";
import { PendingLabel } from "@/components/ui";

function Field({
  label,
  name,
  errors,
  ...props
}: {
  label: string;
  name: string;
  errors: readonly string[] | undefined;
} & React.ComponentProps<"input">) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium">{label}</span>
      <input name={name} className={inputClass} {...props} />
      <FieldError errors={errors} />
    </label>
  );
}

export function ProviderApplicationForm() {
  const [state, action, pending] = useActionState(applyAsProvider, null);
  const errors = (field: string) => fieldErrorsOf(state, field);
  return (
    <form action={action} className="flex max-w-xl flex-col gap-4" noValidate>
      <Field
        label="Business name"
        name="displayName"
        required
        maxLength={120}
        errors={errors("displayName")}
      />
      <Field
        label="Short web address (e.g. ziro-valley-treks)"
        name="slug"
        required
        maxLength={60}
        errors={errors("slug")}
      />
      <Field label="District" name="district" maxLength={80} errors={errors("district")} />
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Public description</span>
        <textarea name="description" rows={4} maxLength={4000} className={inputClass} />
        <FieldError errors={errors("description")} />
      </label>
      <fieldset className="flex flex-col gap-4 rounded-xl border border-line bg-surface shadow-xs p-5">
        <legend className="px-1 text-sm font-medium">
          Private — seen only by you and Himverse admins
        </legend>
        <Field
          label="Registered legal name"
          name="legalName"
          required
          maxLength={200}
          errors={errors("legalName")}
        />
        <Field
          label="Contact email"
          name="contactEmail"
          type="email"
          required
          errors={errors("contactEmail")}
        />
        <Field
          label="Contact phone"
          name="contactPhone"
          type="tel"
          maxLength={20}
          errors={errors("contactPhone")}
        />
      </fieldset>
      <FormAlert state={state} />
      <button type="submit" disabled={pending} className={`${buttonClass} self-start`}>
        <PendingLabel pending={pending} busy="Saving…" idle="Save application as draft" />
      </button>
    </form>
  );
}

export function SubmitForReviewForm({ providerId }: { providerId: string }) {
  const [state, action, pending] = useActionState(submitForReview, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="providerId" value={providerId} />
      <FormAlert state={state} />
      <button type="submit" disabled={pending} className={`${buttonClass} self-start`}>
        <PendingLabel pending={pending} busy="Submitting…" idle="Submit for review" />
      </button>
    </form>
  );
}

export function NewExperienceForm({
  providerId,
  destinations,
}: {
  providerId: string;
  destinations: readonly PublicDestination[];
}) {
  const [state, action, pending] = useActionState(addExperience, null);
  const errors = (field: string) => fieldErrorsOf(state, field);
  if (destinations.length === 0) {
    return <p className="text-sm text-muted">No destinations are published yet.</p>;
  }
  return (
    <form action={action} className="flex max-w-xl flex-col gap-4" noValidate>
      <input type="hidden" name="providerId" value={providerId} />
      <Field label="Title" name="title" required maxLength={140} errors={errors("title")} />
      <Field
        label="Short web address"
        name="slug"
        required
        maxLength={80}
        errors={errors("slug")}
      />
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Destination</span>
        <select name="destinationId" required className={inputClass} defaultValue="">
          <option value="" disabled>
            Choose…
          </option>
          {destinations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} ({d.district})
            </option>
          ))}
        </select>
        <FieldError errors={errors("destinationId")} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Category</span>
        <select name="category" required className={inputClass} defaultValue="culture">
          {EXPERIENCE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <Field
        label="Duration (minutes)"
        name="durationMinutes"
        type="number"
        min={15}
        max={43200}
        required
        errors={errors("durationMinutes")}
      />
      <Field
        label="Indicative price from (₹, optional)"
        name="priceFromRupees"
        type="number"
        min={0}
        errors={errors("priceFromRupees")}
      />
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Summary</span>
        <textarea name="summary" rows={3} maxLength={500} className={inputClass} />
        <FieldError errors={errors("summary")} />
      </label>
      <FormAlert state={state} successMessage="Draft saved." />
      <button type="submit" disabled={pending} className={`${buttonClass} self-start`}>
        <PendingLabel pending={pending} busy="Saving…" idle="Save as draft" />
      </button>
    </form>
  );
}

export function ExperienceStatusForm({
  experienceId,
  status,
  label,
}: {
  experienceId: string;
  status: "draft" | "published" | "archived";
  label: string;
}) {
  const [state, action, pending] = useActionState(changeExperienceStatus, null);
  return (
    <form action={action} className="inline-flex flex-col gap-1">
      <input type="hidden" name="experienceId" value={experienceId} />
      <input type="hidden" name="status" value={status} />
      <button type="submit" disabled={pending} className={secondaryButtonClass}>
        {label}
      </button>
      <FormAlert state={state} />
    </form>
  );
}
