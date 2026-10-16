"use client";

import { useActionState, useState } from "react";

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
  changeExperienceAcceptsBookings,
  changeExperienceStatus,
  changeListingTypeAcceptsBookings,
  submitForReview,
} from "../actions";
import { LISTING_TYPE_LABELS, LISTING_TYPES, type ListingType } from "@/lib/listing-options";

import { EXPERIENCE_CATEGORIES } from "../schemas";
import { ListingTypeFields } from "./listing-type-fields";
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
      <fieldset className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
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
  initialType = "experience",
}: {
  providerId: string;
  destinations: readonly PublicDestination[];
  initialType?: ListingType;
}) {
  const [state, action, pending] = useActionState(addExperience, null);
  const [listingType, setListingType] = useState<ListingType>(initialType);
  // React resets the form after a successful save; the browser then shows the
  // type select's first option while the chosen type (and its fields) stay.
  // Remounting the select on reset keeps it showing the chosen type.
  const [resets, setResets] = useState(0);
  const errors = (field: string) => fieldErrorsOf(state, field);
  if (destinations.length === 0) {
    return <p className="text-sm text-muted">No destinations are published yet.</p>;
  }
  return (
    <form
      action={action}
      onReset={() => setResets((n) => n + 1)}
      className="flex max-w-xl flex-col gap-4"
      noValidate
    >
      <input type="hidden" name="providerId" value={providerId} />
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">What are you listing?</span>
        <select
          key={resets}
          value={listingType}
          onChange={(e) => setListingType(e.target.value as ListingType)}
          className={inputClass}
        >
          {LISTING_TYPES.map((t) => (
            <option key={t} value={t}>
              {LISTING_TYPE_LABELS[t].one}
              {t === "stay" ? " (one room type)" : t === "transport" ? " (vehicle hire)" : ""}
            </option>
          ))}
        </select>
      </label>
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
      <ListingTypeFields
        key={listingType}
        listingType={listingType}
        destinations={destinations}
        errors={errors}
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

/**
 * Partner switch: whether travellers can request this listing (and AI trip
 * plans can use it). Online = bookable; offline listings stay published but
 * take no requests.
 */
export function AcceptsBookingsForm({
  experienceId,
  acceptsBookings,
  title,
}: {
  experienceId: string;
  acceptsBookings: boolean;
  title: string;
}) {
  const [state, action, pending] = useActionState(changeExperienceAcceptsBookings, null);
  return (
    <form action={action} className="inline-flex flex-col gap-1">
      <input type="hidden" name="experienceId" value={experienceId} />
      <input type="hidden" name="acceptsBookings" value={acceptsBookings ? "false" : "true"} />
      <OnlineSwitch
        on={acceptsBookings}
        pending={pending}
        label={`Take booking requests for ${title}`}
      />
      <FormAlert state={state} />
    </form>
  );
}

/** A submit button styled and announced as an on/off switch. */
function OnlineSwitch({ on, pending, label }: { on: boolean; pending: boolean; label: string }) {
  return (
    <button
      type="submit"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-medium text-fg transition hover:border-line-strong disabled:opacity-60"
    >
      <span
        aria-hidden="true"
        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition ${
          on ? "bg-accent" : "bg-line-strong"
        }`}
      >
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-surface shadow transition-all ${
            on ? "left-[1.125rem]" : "left-0.5"
          }`}
        />
      </span>
      <span aria-hidden="true">{on ? "Online" : "Offline"}</span>
    </button>
  );
}

/** Takes every listing of one type online or offline at once. */
export function ListingTypeBookingsForm({
  listingType,
  allOnline,
}: {
  listingType: ListingType;
  allOnline: boolean;
}) {
  const [state, action, pending] = useActionState(changeListingTypeAcceptsBookings, null);
  const many = LISTING_TYPE_LABELS[listingType].many.toLowerCase();
  const changed = state?.ok ? state.data.changed : 0;
  return (
    <form action={action} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="listingType" value={listingType} />
      <input type="hidden" name="acceptsBookings" value={allOnline ? "false" : "true"} />
      <button type="submit" disabled={pending} className={secondaryButtonClass}>
        <PendingLabel
          pending={pending}
          busy="Updating…"
          idle={allOnline ? `Take all ${many} offline` : `Put all ${many} online`}
        />
      </button>
      <FormAlert
        state={state}
        successMessage={changed === 0 ? "Nothing to change." : `${changed} updated.`}
      />
    </form>
  );
}
