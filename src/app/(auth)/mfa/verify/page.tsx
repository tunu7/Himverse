import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { LoadingBlock } from "@/components/page-shell";
import { SecondStepForm } from "@/features/auth/components/mfa-forms";
import { signOut } from "@/features/auth/actions";
import { safeRedirectPath } from "@/lib/redirect";
import { getAssurance } from "@/server/auth/assurance";
import { getCurrentAccount, homePathFor, requireUserForPage } from "@/server/auth/session";

export const metadata: Metadata = { title: "Two-step login · Himverse.AI" };

async function VerifyContent({ searchParams }: PageProps<"/mfa/verify">) {
  const { next } = await searchParams;
  await requireUserForPage("/mfa/verify");
  const [assurance, account] = await Promise.all([getAssurance(), getCurrentAccount()]);
  const destination = safeRedirectPath(next, homePathFor(account?.accountType ?? null));
  if (!assurance?.hasVerifiedTotp) {
    redirect(`/mfa/setup?next=${encodeURIComponent(destination)}`);
  }
  if (assurance.aal === "aal2") {
    redirect(destination);
  }
  return (
    <div className="flex flex-col gap-5">
      <SecondStepForm next={destination} />
      <p className="text-sm text-muted">
        Lost your phone? Contact Himverse support to reset two-step login after we verify it&apos;s
        you.
      </p>
      <form action={signOut}>
        <button type="submit" className="text-sm font-medium text-accent hover:underline">
          Sign out
        </button>
      </form>
    </div>
  );
}

export default function MfaVerifyPage(props: PageProps<"/mfa/verify">) {
  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl font-semibold tracking-[-0.03em] text-fg">Two-step login</h1>
        <p className="text-muted">Enter the 6-digit code from your authenticator app.</p>
      </header>
      <Suspense fallback={<LoadingBlock label="Loading…" variant="form" />}>
        <VerifyContent {...props} />
      </Suspense>
    </main>
  );
}
