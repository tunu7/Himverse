import { Suspense } from "react";

import { LoadingBlock, PageShell } from "@/components/page-shell";
import { AccountSettings } from "@/features/account/components/account-settings";
import { requireAccountForPage } from "@/server/auth/session";

async function PartnerAccount() {
  await requireAccountForPage("/provider/account", ["partner"]);
  return <AccountSettings accountType="partner" />;
}

export default function PartnerAccountPage() {
  return (
    <PageShell title="Account settings" description="Your sign-in and profile details.">
      <Suspense fallback={<LoadingBlock label="Loading your account…" variant="form" />}>
        <PartnerAccount />
      </Suspense>
    </PageShell>
  );
}
