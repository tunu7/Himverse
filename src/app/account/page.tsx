import Link from "next/link";
import { Suspense } from "react";

import { secondaryButtonClass } from "@/components/form-feedback";
import { LoadingBlock, PageShell } from "@/components/page-shell";
import { ProfileForm } from "@/features/account/components/profile-form";
import { signOut } from "@/features/auth/actions";
import { isCurrentUserAdmin, requireUserForPage } from "@/server/auth/session";
import { getMyProfile } from "@/server/profiles/profiles";

async function AccountContent() {
  await requireUserForPage("/account");
  const [profile, isAdmin] = await Promise.all([getMyProfile(), isCurrentUserAdmin()]);
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <p className="text-muted">
          Signed in as <span className="font-medium">{profile.email}</span>
        </p>
        <p className="text-sm text-subtle">
          Account ID: <code data-testid="account-id">{profile.id}</code>
        </p>
        <ProfileForm displayName={profile.displayName} />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Providers</h2>
        <Link
          href="/provider"
          className="font-medium text-accent underline-offset-4 hover:underline"
        >
          Manage your provider application and experiences
        </Link>
        {isAdmin ? (
          <Link
            href="/admin"
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            Admin dashboard
          </Link>
        ) : null}
      </section>
      <form action={signOut}>
        <button type="submit" className={secondaryButtonClass}>
          Sign out
        </button>
      </form>
    </div>
  );
}

export default function AccountPage() {
  return (
    <PageShell title="Your account" width="narrow">
      <Suspense fallback={<LoadingBlock label="Loading your account…" variant="form" />}>
        <AccountContent />
      </Suspense>
    </PageShell>
  );
}
