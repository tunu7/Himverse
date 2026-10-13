import Link from "next/link";
import { Suspense } from "react";

import { AccountMenu } from "@/components/account-menu";
import { BrandLogo } from "@/components/brand";
import { MobileMenu, MobileNav, NavLinkItems, NavLinks } from "@/components/nav-links";
import { signOut } from "@/features/auth/actions";
import { getCurrentUser, isCurrentUserAdmin, isCurrentUserPartner } from "@/server/auth/session";

async function AuthLinks() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <span className="flex items-center gap-1">
        <Link
          href="/sign-up?as=partner"
          className="hidden rounded-full px-3.5 py-1.5 text-muted transition-colors hover:text-fg lg:inline-block"
        >
          List your experiences
        </Link>
        <Link
          href="/sign-in"
          className="rounded-full bg-fg px-4 py-1.5 font-medium text-canvas transition duration-200 hover:bg-accent hover:text-on-accent"
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

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-canvas/75 backdrop-blur-xl backdrop-saturate-150">
      <nav
        aria-label="Main"
        className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 text-sm sm:px-6"
      >
        <Link href="/" className="group text-[15px] text-fg">
          <BrandLogo />
        </Link>
        <div className="mx-auto hidden items-center gap-0.5 md:flex">
          <Suspense fallback={<NavLinkItems pathname={null} />}>
            <NavLinks />
          </Suspense>
        </div>
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <Suspense fallback={<span className="inline-block w-16" aria-hidden />}>
            <AuthLinks />
          </Suspense>
          <Suspense fallback={<MobileMenu pathname={null} />}>
            <MobileNav />
          </Suspense>
        </div>
      </nav>
    </header>
  );
}
