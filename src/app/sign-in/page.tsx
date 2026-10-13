import { Suspense } from "react";

import { LoadingBlock, PageShell } from "@/components/page-shell";
import { SignInForm } from "@/features/auth/components/auth-forms";
import { GoogleSignIn } from "@/features/auth/components/google-sign-in";
import { safeRedirectPath } from "@/lib/redirect";

async function SignInContent({ searchParams }: PageProps<"/sign-in">) {
  const { next, error } = await searchParams;
  return (
    <div className="flex max-w-md flex-col gap-4">
      {error === "confirmation_failed" ? (
        <p role="alert" className="text-sm text-danger">
          That confirmation link is invalid or has expired. Please sign in or request a new link.
        </p>
      ) : null}
      {error === "oauth_failed" ? (
        <p role="alert" className="text-sm text-danger">
          Google sign-in didn&apos;t complete. Please try again or use your email.
        </p>
      ) : null}
      <GoogleSignIn next={safeRedirectPath(next)} />
      <SignInForm next={safeRedirectPath(next)} />
    </div>
  );
}

export default function SignInPage(props: PageProps<"/sign-in">) {
  return (
    <PageShell
      title="Sign in"
      width="form"
      description="Welcome back. Pick up your trip plans and booking requests."
    >
      <Suspense fallback={<LoadingBlock label="Loading…" variant="form" />}>
        <SignInContent {...props} />
      </Suspense>
    </PageShell>
  );
}
