"use client";

import { useActionState } from "react";

import { FormAlert, secondaryButtonClass } from "@/components/form-feedback";
import { Spinner } from "@/components/ui";

import { moderateExperienceAction } from "../actions";

type Action = "publish" | "unpublish" | "archive";

const LABELS: Record<Action, string> = {
  publish: "Publish",
  unpublish: "Unpublish",
  archive: "Archive",
};

export function ModerationButtons({
  experienceId,
  actions,
}: {
  experienceId: string;
  actions: readonly Action[];
}) {
  const [state, action, pending] = useActionState(moderateExperienceAction, null);
  return (
    <form action={action} className="flex flex-col items-end gap-2">
      <input type="hidden" name="experienceId" value={experienceId} />
      <div className="flex flex-wrap justify-end gap-2">
        {pending ? <Spinner className="size-4 self-center text-muted" /> : null}
        {actions.map((a) => (
          <button
            key={a}
            type="submit"
            name="action"
            value={a}
            disabled={pending}
            className={`${secondaryButtonClass} ${a === "archive" ? "text-danger" : ""}`}
          >
            {LABELS[a]}
          </button>
        ))}
      </div>
      <FormAlert state={state} successMessage="Updated." />
    </form>
  );
}
