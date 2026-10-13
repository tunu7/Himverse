import Link from "next/link";
import { Suspense } from "react";

import { AccountMenu } from "@/components/account-menu";
import { NavLinkItems, NavLinks } from "@/components/nav-links";
import { signOut } from "@/features/auth/actions";
import { getCurrentUser, isCurrentUserAdmin, isCurrentUserPartner } from "@/server/auth/session";

async function AuthLinks() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <span className="flex items-center gap-1">
        <Link
          href="/sign-up?as=partner"
          className="hidden rounded-md px-2.5 py-1.5 text-muted transition-colors hover:bg-surface-muted hover:text-fg md:inline-block"
        >
          List your experiences
        </Link>
        <Link
          href="/sign-in"
          className="rounded-full bg-accent px-3.5 py-1.5 font-semibold text-white transition-colors hover:bg-accent-hover dark:text-zinc-950"
        >
          Sign in
        </Link>
      </span>
    );
  }
  const [isAdmin, isPartner] = await Promise.all([isCurrentUserAdmin(), isCurrentUserPartner()]);
  const links = [
    { href: "/account", label: "My account" },
    { href: "/itineraries", label: "My trips" },
    { href: "/bookings", label: "My bookings" },
    isPartner
      ? { href: "/provider", label: "Partner portal", tone: "accent" as const }
      : { href: "/provider", label: "Become a tourism partner" },
    ...(isAdmin ? [{ href: "/admin", label: "Admin console", tone: "accent" as const }] : []),
  ];
  return <AccountMenu initial={(user.email ?? "?").slice(0, 1)} links={links} signOut={signOut} />;
}

function BrandMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6 text-accent">
      <path d="M2 20 9 7l4 7 2.5-4L22 20Z" fill="currentColor" opacity="0.25" />
      <path
        d="M2 20 9 7l4 7 2.5-4L22 20Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur supports-[backdrop-filter]:bg-canvas/70">
      <nav
        aria-label="Main"
        className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-2 gap-y-2 px-4 py-3 text-sm sm:px-6"
      >
        <Link
          href="/"
          className="order-1 flex items-center gap-2 font-semibold tracking-tight text-fg"
        >
          <BrandMark />
          Himverse.AI
        </Link>
        {/* Mobile: brand and account on the first row, links scroll on the second. */}
        <div className="order-3 -mx-2 flex w-[calc(100%+1rem)] items-center gap-1 overflow-x-auto sm:order-2 sm:mx-0 sm:ml-auto sm:w-auto">
          <Suspense fallback={<NavLinkItems pathname={null} />}>
            <NavLinks />
          </Suspense>
        </div>
        <div className="order-2 ml-auto sm:order-3 sm:ml-0">
          <Suspense fallback={<span className="inline-block w-16" aria-hidden />}>
            <AuthLinks />
          </Suspense>
        </div>
      </nav>
    </header>
  );
}
