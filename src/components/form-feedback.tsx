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
        className="animate-rise rounded-xl border border-accent/20 bg-accent-soft px-3.5 py-2.5 text-sm text-accent-soft-fg"
      >
        {successMessage}
      </p>
    ) : null;
  }
  return (
    <p
      role="alert"
      className="animate-rise rounded-xl border border-danger/20 bg-danger-soft px-3.5 py-2.5 text-sm text-danger-soft-fg"
    >
      {state.error.message}
    </p>
  );
}

// Shared control styles. Colours come from the design tokens in globals.css.
export const inputClass =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-fg transition duration-200 placeholder:text-subtle hover:border-line-strong focus:border-accent focus:ring-4 focus:ring-accent/12 focus:outline-none";

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium transition duration-200 ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100";

export const buttonClass = `${buttonBase} bg-fg px-5 py-2.5 text-canvas hover:-translate-y-px hover:bg-accent hover:text-on-accent hover:shadow-lg hover:shadow-accent/20`;

export const secondaryButtonClass = `${buttonBase} border border-line bg-surface px-4 py-2 text-sm text-fg hover:-translate-y-px hover:border-line-strong hover:shadow-sm`;

/** Bordered surface used for cards, panels and grouped form sections. */
export const cardClass = "rounded-2xl border border-line bg-surface";

/** Label text above a form control. */
export const labelClass = "text-sm font-medium text-fg";

/** Inline text link. */
export const linkClass =
  "font-medium text-accent underline decoration-accent/30 underline-offset-4 transition-colors hover:text-accent-hover hover:decoration-accent";
