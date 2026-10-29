import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingBlock } from "@/components/page-shell";
import { SignInForm } from "@/features/auth/components/auth-forms";
import { GoogleSignIn } from "@/features/auth/components/google-sign-in";
import { PhoneSignIn } from "@/features/auth/components/phone-forms";
import { safeRedirectPath } from "@/lib/redirect";

export const metadata: Metadata = { title: "Sign in · Himverse.AI" };

async function SignInContent({ searchParams }: PageProps<"/sign-in">) {
  const { next, error } = await searchParams;
  // "" when absent: the server then lands by role (admin, partner, traveller).
  const destination = safeRedirectPath(next, "");
  return (
    <div className="flex flex-col gap-5">
      {error === "confirmation_failed" ? (
        <p
          role="alert"
          className="rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger-soft-fg"
        >
          That confirmation link is invalid or has expired. Please sign in or request a new link.
        </p>
      ) : null}
      {error === "oauth_failed" ? (
        <p
          role="alert"
          className="rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger-soft-fg"
        >
          Google sign-in didn&apos;t complete. Please try again or use your email.
        </p>
      ) : null}
      <GoogleSignIn next={destination} />
      <SignInForm next={destination} />
      <PhoneSignIn next={destination} />
    </div>
  );
}

export default function SignInPage(props: PageProps<"/sign-in">) {
  return (
    <main className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl font-semibold tracking-[-0.03em] text-fg">Sign in</h1>
        <p className="text-muted">
          Welcome back. Travellers, tourism partners and admins all sign in here.
        </p>
      </header>
      <Suspense fallback={<LoadingBlock label="Loading…" variant="form" />}>
        <SignInContent {...props} />
      </Suspense>
    </main>
  );
}
