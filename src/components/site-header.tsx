import Link from "next/link";
import { Suspense } from "react";

import { AccountMenu } from "@/components/account-menu";
import { BrandLogo } from "@/components/brand";
import { MobileMenu, MobileNav, NavLinkItems, NavLinks } from "@/components/nav-links";
import { signOut } from "@/features/auth/actions";
import { type AccountType, getCurrentAccount } from "@/server/auth/session";
import { getMyBookingUpdates, getPartnerAlerts } from "@/server/bookings/alerts";

type MenuLink = { href: string; label: string; tone?: "accent"; count?: number };

/** Each account type sees only its own area (ADR-0007). */
const MENU: Record<AccountType | "untyped", readonly MenuLink[]> = {
  traveller: [
    { href: "/account", label: "Dashboard" },
    { href: "/itineraries", label: "My trips" },
    { href: "/bookings", label: "My bookings" },
    { href: "/account/settings", label: "Settings" },
  ],
  partner: [
    { href: "/provider", label: "Partner portal", tone: "accent" },
    { href: "/provider/bookings", label: "Booking requests" },
    { href: "/provider/account", label: "Account settings" },
  ],
  admin: [
    { href: "/admin", label: "Admin console", tone: "accent" },
    { href: "/admin/account", label: "Account settings" },
  ],
  untyped: [{ href: "/welcome", label: "Finish setting up", tone: "accent" }],
};

async function AuthLinks() {
  const account = await getCurrentAccount();
  if (!account) {
    return (
      <span className="flex items-center gap-1">
        <Link
          href="/sign-up?as=partner"
          className="hidden rounded-full px-3.5 py-1.5 text-muted transition-colors hover:text-fg lg:inline-block"
        >
          List your business
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
  // Alert counts: traveller booking updates, or partner requests awaiting a reply.
  const counts: Record<string, number> = {};
  if (account.accountType === "traveller") {
    counts["/bookings"] = (await getMyBookingUpdates()).size;
  } else if (account.accountType === "partner") {
    counts["/provider/bookings"] = (await getPartnerAlerts()).needsResponse;
  }
  const links = MENU[account.accountType ?? "untyped"].map((link) => ({
    ...link,
    count: counts[link.href],
  }));
  return (
    <AccountMenu initial={(account.email ?? "?").slice(0, 1)} links={links} signOut={signOut} />
  );
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
