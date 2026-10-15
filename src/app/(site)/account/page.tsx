import Link from "next/link";
import { Suspense } from "react";

import { cardClass, secondaryButtonClass } from "@/components/form-feedback";
import { LoadingBlock, PageShell } from "@/components/page-shell";
import { AccountSettings } from "@/features/account/components/account-settings";
import { signOut } from "@/features/auth/actions";
import { requireAccountForPage } from "@/server/auth/session";

/** The traveller's account. Partners and admins have their own (ADR-0007). */
async function AccountContent() {
  await requireAccountForPage("/account", ["traveller"]);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <AccountSettings accountType="traveller" />

      <section className={`${cardClass} flex flex-col gap-3 p-6`} aria-labelledby="travel-heading">
        <h2 id="travel-heading" className="text-lg font-semibold text-fg">
          Your travel
        </h2>
        <p className="text-sm text-muted">Saved trip plans and your booking requests.</p>
        <div className="flex flex-wrap gap-2">
          <Link href="/itineraries" className={secondaryButtonClass}>
            My trips
          </Link>
          <Link href="/bookings" className={secondaryButtonClass}>
            My bookings
          </Link>
          <Link href="/itineraries/new" className={secondaryButtonClass}>
            Plan a new trip
          </Link>
        </div>
      </section>

      <form action={signOut} className="lg:col-span-2">
        <button type="submit" className={secondaryButtonClass}>
          Sign out
        </button>
      </form>
    </div>
  );
}

export default function AccountPage() {
  return (
    <PageShell title="Your account">
      <Suspense fallback={<LoadingBlock label="Loading your account…" variant="form" />}>
        <AccountContent />
      </Suspense>
    </PageShell>
  );
}
