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
        <p className="text-zinc-600 dark:text-zinc-400">
          Signed in as <span className="font-medium">{profile.email}</span>
        </p>
        <p className="text-sm text-zinc-500">
          Account ID: <code data-testid="account-id">{profile.id}</code>
        </p>
        <ProfileForm displayName={profile.displayName} />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Providers</h2>
        <Link href="/provider" className="underline">
          Manage your provider application and experiences
        </Link>
        {isAdmin ? (
          <Link href="/admin/providers" className="underline">
            Admin: review providers
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
    <PageShell title="Your account">
      <Suspense fallback={<LoadingBlock label="Loading your account…" />}>
        <AccountContent />
      </Suspense>
    </PageShell>
  );
}
