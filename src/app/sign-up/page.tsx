import { Suspense } from "react";

import { LoadingBlock, PageShell } from "@/components/page-shell";
import { SignUpForm } from "@/features/auth/components/auth-forms";
import { safeRedirectPath } from "@/lib/redirect";

async function SignUpContent({ searchParams }: PageProps<"/sign-up">) {
  const { next } = await searchParams;
  return (
    <div className="max-w-md">
      <SignUpForm next={safeRedirectPath(next)} />
    </div>
  );
}

export default function SignUpPage(props: PageProps<"/sign-up">) {
  return (
    <PageShell title="Create your account">
      <Suspense fallback={<LoadingBlock label="Loading…" />}>
        <SignUpContent {...props} />
      </Suspense>
    </PageShell>
  );
}
