import { Suspense } from "react";

import { secondaryButtonClass } from "@/components/form-feedback";
import { LoadingBlock, PageShell } from "@/components/page-shell";
import { AccountSettings } from "@/features/account/components/account-settings";
import { TravellerTabs } from "@/features/account/components/traveller-tabs";
import { signOut } from "@/features/auth/actions";
import { requireAccountForPage } from "@/server/auth/session";

async function Settings() {
  await requireAccountForPage("/account/settings", ["traveller"]);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <AccountSettings accountType="traveller" />
      <form action={signOut} className="lg:col-span-2">
        <button type="submit" className={secondaryButtonClass}>
          Sign out
        </button>
      </form>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <PageShell title="Settings">
      <TravellerTabs active="settings" />
      <Suspense fallback={<LoadingBlock label="Loading your settings…" variant="form" />}>
        <Settings />
      </Suspense>
    </PageShell>
  );
}
