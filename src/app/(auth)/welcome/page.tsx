import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { LoadingBlock } from "@/components/page-shell";
import { AccountTypeForm } from "@/features/auth/components/account-type-form";
import { safeRedirectPath } from "@/lib/redirect";
import { getCurrentAccount, homePathFor, requireUserForPage } from "@/server/auth/session";

export const metadata: Metadata = { title: "Set up your account · Himverse.AI" };

async function WelcomeContent({ searchParams }: PageProps<"/welcome">) {
  const { next, as } = await searchParams;
  await requireUserForPage("/welcome");
  const account = await getCurrentAccount();
  // Already set up (every email sign-up is): go on.
  if (account?.accountType) {
    redirect(safeRedirectPath(next, homePathFor(account.accountType)));
  }
  return (
    <AccountTypeForm
      next={safeRedirectPath(next, "")}
      preselected={as === "partner" ? "partner" : "traveller"}
    />
  );
}

export default function WelcomePage(props: PageProps<"/welcome">) {
  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-semibold tracking-[-0.03em] text-fg">
          How will you use Himverse?
        </h1>
        <p className="text-muted">One last step to set up your account.</p>
      </div>
      <Suspense fallback={<LoadingBlock label="Loading…" variant="form" />}>
        <WelcomeContent {...props} />
      </Suspense>
    </main>
  );
}
