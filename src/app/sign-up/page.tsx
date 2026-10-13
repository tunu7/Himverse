import { Suspense } from "react";

import { LoadingBlock, PageShell } from "@/components/page-shell";
import { SignUpForm } from "@/features/auth/components/auth-forms";
import { GoogleSignIn } from "@/features/auth/components/google-sign-in";
import { safeRedirectPath } from "@/lib/redirect";

async function SignUpContent({ searchParams }: PageProps<"/sign-up">) {
  const { next } = await searchParams;
  return (
    <div className="flex max-w-md flex-col gap-4">
      <GoogleSignIn next={safeRedirectPath(next)} />
      <SignUpForm next={safeRedirectPath(next)} />
    </div>
  );
}

export default function SignUpPage(props: PageProps<"/sign-up">) {
  return (
    <PageShell
      title="Create your account"
      width="form"
      description="Free to join. Save AI trip plans and request experiences from local providers."
    >
      <Suspense fallback={<LoadingBlock label="Loading…" variant="form" />}>
        <SignUpContent {...props} />
      </Suspense>
    </PageShell>
  );
}
