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
import type { PublicDestination } from "@/server/catalog/catalog";

import type { ListingType, PriceUnit } from "@/lib/listing-options";

import { saveBusinessDetails, saveBusinessProfile, saveListing } from "../actions";
import { ListingTypeFields } from "./listing-type-fields";
import { EXPERIENCE_CATEGORIES } from "../schemas";

function TextField({
  label,
  name,
  errors,
  hint,
  ...props
}: {
  label: string;
  name: string;
  errors: readonly string[] | undefined;
  hint?: string;
} & React.ComponentProps<"input">) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium">{label}</span>
      <input name={name} className={inputClass} {...props} />
      {hint ? <span className="text-xs text-subtle">{hint}</span> : null}
      <FieldError errors={errors} />
    </label>
  );
}

/** Public business profile (what travellers see). */
export function BusinessProfileForm({
  providerId,
  displayName,
  description,
  district,
  locked,
}: {
  providerId: string;
  displayName: string;
  description: string;
  district: string | null;
  locked: boolean;
}) {
  const [state, action, pending] = useActionState(saveBusinessProfile, null);
  const errors = (f: string) => fieldErrorsOf(state, f);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="providerId" value={providerId} />
      <fieldset disabled={locked} className="flex flex-col gap-4 disabled:opacity-60">
        <TextField
          label="Business name"
          name="displayName"
          defaultValue={displayName}
          required
          maxLength={120}
          errors={errors("displayName")}
        />
        <TextField
          label="District"
          name="district"
          defaultValue={district ?? ""}
          maxLength={80}
          errors={errors("district")}
        />
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">About your business</span>
          <textarea
            name="description"
            rows={5}
            maxLength={4000}
            defaultValue={description}
            className={inputClass}
          />
          <FieldError errors={errors("description")} />
        </label>
      </fieldset>
      <FormAlert state={state} successMessage="Profile saved." />
      <button type="submit" disabled={pending || locked} className={`${buttonClass} self-start`}>
        <PendingLabel pending={pending} busy="Saving…" idle="Save profile" />
      </button>
    </form>
  );
}

/** Legal name and contact details (reviewed by Himverse; locked once verified). */
export function BusinessDetailsForm({
  providerId,
  legalName,
  contactEmail,
  contactPhone,
  locked,
}: {
  providerId: string;
  legalName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  locked: boolean;
}) {
  const [state, action, pending] = useActionState(saveBusinessDetails, null);
  const errors = (f: string) => fieldErrorsOf(state, f);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="providerId" value={providerId} />
      <fieldset disabled={locked} className="flex flex-col gap-4 disabled:opacity-60">
        <TextField
          label="Registered legal name"
          name="legalName"
          defaultValue={legalName ?? ""}
          required
          maxLength={200}
          errors={errors("legalName")}
        />
        <TextField
          label="Contact email"
          name="contactEmail"
          type="email"
          defaultValue={contactEmail ?? ""}
          required
          errors={errors("contactEmail")}
        />
        <TextField
          label="Contact phone"
          name="contactPhone"
          type="tel"
          defaultValue={contactPhone ?? ""}
          maxLength={20}
          errors={errors("contactPhone")}
        />
      </fieldset>
      <FormAlert state={state} successMessage="Details saved." />
      <button type="submit" disabled={pending || locked} className={`${buttonClass} self-start`}>
        <PendingLabel pending={pending} busy="Saving…" idle="Save details" />
      </button>
    </form>
  );
}

export type ListingFormValues = {
  id: string;
  listingType: ListingType;
  priceUnit: PriceUnit;
  dailyCapacity: number | null;
  maxGuests: number | null;
  languages: string[];
  routeToDestinationId: string | null;
  title: string;
  slug: string;
  summary: string;
  description: string;
  category: string;
  destinationId: string;
  durationMinutes: number;
  priceFromMinor: number | null;
};

/** Edits a listing's details; publishing and bookings are separate controls. */
export function ListingEditForm({
  listing,
  destinations,
}: {
  listing: ListingFormValues;
  destinations: readonly PublicDestination[];
}) {
  const [state, action, pending] = useActionState(saveListing, null);
  const errors = (f: string) => fieldErrorsOf(state, f);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="experienceId" value={listing.id} />
      <TextField
        label="Title"
        name="title"
        defaultValue={listing.title}
        required
        maxLength={140}
        errors={errors("title")}
      />
      <TextField
        label="Web address"
        name="slug"
        defaultValue={listing.slug}
        required
        maxLength={80}
        hint="Lowercase letters, numbers and hyphens. Changing it changes the public link."
        errors={errors("slug")}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Destination</span>
          <select
            name="destinationId"
            required
            defaultValue={listing.destinationId}
            className={inputClass}
          >
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
          <select name="category" defaultValue={listing.category} className={inputClass}>
            {EXPERIENCE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>

        <TextField
          label="Price from (₹, optional)"
          name="priceFromRupees"
          type="number"
          min={0}
          defaultValue={
            listing.priceFromMinor === null ? "" : Math.round(listing.priceFromMinor / 100)
          }
          errors={errors("priceFromRupees")}
        />
      </div>
      <ListingTypeFields
        listingType={listing.listingType}
        defaults={{
          priceUnit: listing.priceUnit,
          dailyCapacity: listing.dailyCapacity,
          maxGuests: listing.maxGuests,
          languages: listing.languages,
          routeToDestinationId: listing.routeToDestinationId,
          durationMinutes: listing.durationMinutes,
        }}
        destinations={destinations}
        errors={errors}
      />
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Short summary</span>
        <textarea
          name="summary"
          rows={2}
          maxLength={500}
          defaultValue={listing.summary}
          className={inputClass}
        />
        <FieldError errors={errors("summary")} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Full description</span>
        <textarea
          name="description"
          rows={8}
          maxLength={8000}
          defaultValue={listing.description}
          className={inputClass}
        />
        <FieldError errors={errors("description")} />
      </label>
      <FormAlert state={state} successMessage="Listing saved." />
      <button type="submit" disabled={pending} className={`${buttonClass} self-start`}>
        <PendingLabel pending={pending} busy="Saving…" idle="Save listing" />
      </button>
    </form>
  );
}
