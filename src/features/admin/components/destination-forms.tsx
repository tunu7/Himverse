"use client";

import { useActionState } from "react";

import {
  buttonClass,
  FieldError,
  fieldErrorsOf,
  FormAlert,
  inputClass,
  labelClass,
  secondaryButtonClass,
} from "@/components/form-feedback";
import { PendingLabel } from "@/components/ui";

import { deleteDestinationAction, saveDestinationAction } from "../actions";

export type DestinationFormValues = {
  id?: string;
  slug: string;
  name: string;
  district: string;
  summary: string;
  description: string;
  isPublished: boolean;
};

const EMPTY: DestinationFormValues = {
  slug: "",
  name: "",
  district: "",
  summary: "",
  description: "",
  isPublished: false,
};

/** Create (no id) or edit a destination. */
export function DestinationForm({ initial = EMPTY }: { initial?: DestinationFormValues }) {
  const [state, action, pending] = useActionState(saveDestinationAction, null);
  const errors = (field: string) => fieldErrorsOf(state, field);
  const editing = Boolean(initial.id);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Name</span>
          <input name="name" defaultValue={initial.name} maxLength={120} className={inputClass} />
          <FieldError errors={errors("name")} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>District</span>
          <input
            name="district"
            defaultValue={initial.district}
            maxLength={80}
            className={inputClass}
          />
          <FieldError errors={errors("district")} />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className={labelClass}>Web address (slug)</span>
          <input
            name="slug"
            defaultValue={initial.slug}
            maxLength={60}
            placeholder="e.g. ziro"
            className={inputClass}
          />
          <span className="text-xs text-subtle">
            Used in /destinations/…; lowercase letters, numbers and hyphens. Changing it breaks old
            links.
          </span>
          <FieldError errors={errors("slug")} />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className={labelClass}>Summary</span>
          <input
            name="summary"
            defaultValue={initial.summary}
            maxLength={500}
            className={inputClass}
          />
          <FieldError errors={errors("summary")} />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className={labelClass}>Description</span>
          <textarea
            name="description"
            rows={4}
            defaultValue={initial.description}
            maxLength={8000}
            className={inputClass}
          />
          <FieldError errors={errors("description")} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm text-fg-soft">
        <input
          type="checkbox"
          name="isPublished"
          defaultChecked={initial.isPublished}
          className="size-4 accent-[var(--accent)]"
        />
        Published (visible to travellers and the AI planner)
      </label>
      <FormAlert
        state={state}
        successMessage={editing ? "Destination saved." : "Destination created."}
      />
      <button type="submit" disabled={pending} className={`${buttonClass} self-start`}>
        <PendingLabel
          pending={pending}
          busy="Saving…"
          idle={editing ? "Save destination" : "Create destination"}
        />
      </button>
    </form>
  );
}

export function DeleteDestinationButton({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState(deleteDestinationAction, null);
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(`Delete ${name}? This can't be undone.`)) event.preventDefault();
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className={`${secondaryButtonClass} self-start text-danger`}
      >
        Delete destination
      </button>
      <FormAlert state={state} />
    </form>
  );
}
