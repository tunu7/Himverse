"use client";

import { secondaryButtonClass } from "@/components/form-feedback";

export default function RouteError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-6 py-16">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-muted">We couldn&apos;t load this page. Please try again in a moment.</p>
      <button type="button" onClick={reset} className={`${secondaryButtonClass} self-start`}>
        Try again
      </button>
    </main>
  );
}
