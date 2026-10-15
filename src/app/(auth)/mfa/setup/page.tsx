import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { LoadingBlock } from "@/components/page-shell";
import { TotpSetup } from "@/features/auth/components/mfa-forms";
import { safeRedirectPath } from "@/lib/redirect";
import { getAssurance } from "@/server/auth/assurance";
import { getCurrentAccount, homePathFor, requireUserForPage } from "@/server/auth/session";

export const metadata: Metadata = { title: "Set up two-step login · Himverse.AI" };

async function SetupContent({ searchParams }: PageProps<"/mfa/setup">) {
  const { next } = await searchParams;
  await requireUserForPage("/mfa/setup");
  const [assurance, account] = await Promise.all([getAssurance(), getCurrentAccount()]);
  const destination = safeRedirectPath(next, homePathFor(account?.accountType ?? null));
  // Already set up: verify instead (or carry on if already verified).
  if (assurance?.hasVerifiedTotp) {
    redirect(
      assurance.aal === "aal2"
        ? destination
        : `/mfa/verify?next=${encodeURIComponent(destination)}`,
    );
  }
  return <TotpSetup next={destination} />;
}

export default function MfaSetupPage(props: PageProps<"/mfa/setup">) {
  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl font-semibold tracking-[-0.03em] text-fg">Protect your account</h1>
        <p className="text-muted">
          Partner and admin accounts use two-step login: your password plus a code from an
          authenticator app on your phone.
        </p>
      </header>
      <Suspense fallback={<LoadingBlock label="Loading…" variant="form" />}>
        <SetupContent {...props} />
      </Suspense>
    </main>
  );
}
