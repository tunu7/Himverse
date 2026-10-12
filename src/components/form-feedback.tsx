import type { ActionResult } from "@/lib/errors";

export function FieldError({ errors }: { errors: readonly string[] | undefined }) {
  if (!errors?.length) {
    return null;
  }
  return <p className="text-sm text-red-700 dark:text-red-400">{errors.join(" ")}</p>;
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
      <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
        {successMessage}
      </p>
    ) : null;
  }
  return (
    <p role="alert" className="text-sm text-red-700 dark:text-red-400">
      {state.error.message}
    </p>
  );
}

export const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 focus:outline-2 focus:outline-emerald-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

export const buttonClass =
  "rounded-md bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-800 disabled:opacity-60";

export const secondaryButtonClass =
  "rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800";
