import { getPublicEnv } from "@/lib/env";

/**
 * "Continue with Google", shown only when the provider is enabled. A plain <a>
 * (not next/link): the target is a route handler that redirects to Google, so it
 * needs a full navigation, not a client-side route fetch.
 */
export function GoogleSignIn({ next }: { next: string }) {
  if (getPublicEnv().NEXT_PUBLIC_AUTH_GOOGLE_ENABLED !== "true") return null;
  return (
    <div className="flex flex-col gap-4">
      <a
        href={`/auth/google?next=${encodeURIComponent(next)}`}
        className="inline-flex items-center justify-center rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        Continue with Google
      </a>
      <p className="text-center text-xs text-zinc-500" aria-hidden="true">
        or use your email
      </p>
    </div>
  );
}
