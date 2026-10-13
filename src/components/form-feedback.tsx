import type { ActionResult } from "@/lib/errors";

export function FieldError({ errors }: { errors: readonly string[] | undefined }) {
  if (!errors?.length) {
    return null;
  }
  return <p className="text-sm text-danger">{errors.join(" ")}</p>;
}

export function fieldErrorsOf(state: ActionResult<unknown> | null, field: string) {
  return state && !state.ok ? state.error.fieldErrors?.[field] : undefined;
}

export function FormAlert({
  state,
  successMessage,
}: {
  state: ActionResult<unknown> | null;
  successMessage?: string;
}) {
  if (!state) {
    return null;
  }
  if (state.ok) {
    return successMessage ? (
      <p
        role="status"
        className="rounded-md border border-accent/30 bg-accent-soft px-3 py-2 text-sm text-accent-soft-fg"
      >
        {successMessage}
      </p>
    ) : null;
  }
  return (
    <p
      role="alert"
      className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger-soft-fg"
    >
      {state.error.message}
    </p>
  );
}

// Shared control styles. Colours come from the design tokens in globals.css.
export const inputClass =
  "w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-fg shadow-xs transition placeholder:text-subtle hover:border-subtle focus:border-accent focus:ring-4 focus:ring-accent/15 focus:outline-none";

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100";

export const buttonClass = `${buttonBase} bg-accent px-5 py-2.5 text-white shadow-sm shadow-accent/20 hover:bg-accent-hover hover:shadow-md hover:shadow-accent/25 dark:text-zinc-950`;

export const secondaryButtonClass = `${buttonBase} border border-line-strong bg-surface px-4 py-2 text-sm text-fg hover:border-subtle hover:bg-surface-muted`;

/** Bordered surface used for cards, panels and grouped form sections. */
export const cardClass = "rounded-2xl border border-line bg-surface shadow-xs";

/** Label text above a form control. */
export const labelClass = "text-sm font-medium text-fg";

/** Inline text link. */
export const linkClass =
  "font-medium text-accent underline-offset-4 hover:text-accent-hover hover:underline";
