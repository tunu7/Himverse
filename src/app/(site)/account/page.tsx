import Link from "next/link";
import { Suspense } from "react";

import { buttonClass, cardClass, secondaryButtonClass } from "@/components/form-feedback";
import { LoadingBlock, PageShell } from "@/components/page-shell";
import { ProfileForm } from "@/features/account/components/profile-form";
import { signOut } from "@/features/auth/actions";
import { isCurrentUserAdmin, requireUserForPage } from "@/server/auth/session";
import { getMyProfile } from "@/server/profiles/profiles";
import { listMyProviders } from "@/server/providers/providers";
import { PROVIDER_STATUS_LABELS } from "@/server/providers/status";

function Card({
  title,
  children,
  tone = "default",
}: {
  title: string;
  children: React.ReactNode;
  tone?: "default" | "accent" | "admin";
}) {
  const toneClass =
    tone === "accent"
      ? "border-accent/25 bg-accent-soft"
      : tone === "admin"
        ? "border-zinc-800 bg-zinc-950 text-white"
        : "";
  return (
    <section className={`${cardClass} ${toneClass} flex flex-col gap-3 p-6`}>
      <h2 className={`text-lg font-semibold ${tone === "admin" ? "text-white" : "text-fg"}`}>
        {title}
      </h2>
      {children}
    </section>
  );
}

async function AccountContent() {
  await requireUserForPage("/account");
  const [profile, isAdmin, providers] = await Promise.all([
    getMyProfile(),
    isCurrentUserAdmin(),
    listMyProviders(),
  ]);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Profile">
        <p className="text-muted">
          Signed in as <span className="font-medium text-fg">{profile.email}</span>
        </p>
        <ProfileForm displayName={profile.displayName} />
        <p className="text-xs text-subtle">
          Account ID: <code data-testid="account-id">{profile.id}</code>
        </p>
      </Card>

      <Card title="Your travel">
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
      </Card>

      <Card title="Tourism partner" tone="accent">
        {providers.length > 0 ? (
          <>
            <ul className="flex flex-col gap-1 text-sm">
              {providers.map((p) => (
                <li key={p.id} className="text-fg-soft">
                  <span className="font-medium text-fg">{p.displayName}</span> ·{" "}
                  {PROVIDER_STATUS_LABELS[p.status]}
                </li>
              ))}
            </ul>
            <Link href="/provider" className={`${buttonClass} self-start`}>
              Open partner portal
            </Link>
          </>
        ) : (
          <>
            <p className="text-sm text-fg-soft">
              Run treks, homestays or tours? Apply to list your experiences on Himverse.
            </p>
            <Link href="/provider" className={`${buttonClass} self-start`}>
              Apply as a tourism partner
            </Link>
          </>
        )}
      </Card>

      {isAdmin ? (
        <Card title="Administration" tone="admin">
          <p className="text-sm text-zinc-400">
            Review providers, curate destinations, moderate experiences and see all bookings.
          </p>
          <Link
            href="/admin"
            className="inline-flex items-center justify-center self-start rounded-full bg-white px-5 py-2.5 font-semibold text-zinc-900 transition hover:bg-zinc-200"
          >
            Admin dashboard
          </Link>
        </Card>
      ) : null}

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
