"use client";

import { useActionState } from "react";

import { buttonClass, FormAlert } from "@/components/form-feedback";
import { PendingLabel } from "@/components/ui";

import { chooseAccountType } from "../actions";

const CHOICES = [
  {
    value: "traveller",
    title: "I'm travelling",
    body: "Plan trips with AI and request experiences, stays, guides and transport.",
  },
  {
    value: "partner",
    title: "I run a tourism business",
    body: "List and manage your offerings and answer booking requests. Partner accounts can't book trips.",
  },
] as const;

/** One-time choice for accounts created with Google. */
export function AccountTypeForm({
  next,
  preselected,
}: {
  next: string;
  preselected: "traveller" | "partner";
}) {
  const [state, action, pending] = useActionState(chooseAccountType, null);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">How will you use Himverse?</legend>
        {CHOICES.map((choice) => (
          <label
            key={choice.value}
            className="flex cursor-pointer gap-3 rounded-2xl border border-line bg-surface p-4 transition has-[:checked]:border-accent has-[:checked]:ring-2 has-[:checked]:ring-accent/20 hover:border-line-strong"
          >
            <input
              type="radio"
              name="accountType"
              value={choice.value}
              defaultChecked={choice.value === preselected}
              className="mt-1 accent-[var(--color-accent)]"
            />
            <span className="flex flex-col gap-0.5">
              <span className="font-semibold text-fg">{choice.title}</span>
              <span className="text-sm text-muted">{choice.body}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="text-xs text-subtle">
        This can&apos;t be changed later. To do both, use a separate account for each.
      </p>
      <FormAlert state={state} />
      <button type="submit" disabled={pending} className={`${buttonClass} w-full py-3`}>
        <PendingLabel pending={pending} busy="Setting up…" idle="Continue" />
      </button>
    </form>
  );
}
