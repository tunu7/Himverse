import { Suspense } from "react";

import { LoadingBlock, PageShell } from "@/components/page-shell";
import { AccountSettings } from "@/features/account/components/account-settings";
import { requireAdminForPage } from "@/server/auth/session";

async function AdminAccount() {
  await requireAdminForPage("/admin/account");
  return <AccountSettings accountType="admin" />;
}

export default function AdminAccountPage() {
  return (
    <PageShell title="Account settings" description="Your sign-in and profile details.">
      <Suspense fallback={<LoadingBlock label="Loading your account…" variant="form" />}>
        <AdminAccount />
      </Suspense>
    </PageShell>
  );
}
