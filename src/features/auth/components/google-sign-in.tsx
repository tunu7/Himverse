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
        className="inline-flex items-center justify-center rounded-lg border border-line-strong bg-surface px-4 py-2 text-sm font-medium text-fg shadow-xs transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Continue with Google
      </a>
      <p className="text-center text-xs text-subtle" aria-hidden="true">
        or use your email
      </p>
    </div>
  );
}
