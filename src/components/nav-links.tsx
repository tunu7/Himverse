"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/destinations", label: "Destinations" },
  { href: "/experiences", label: "Experiences" },
  { href: "/itineraries", label: "Trips" },
  { href: "/bookings", label: "Bookings" },
] as const;

/** The main links; `pathname` (when known) highlights the current section. */
export function NavLinkItems({ pathname }: { pathname: string | null }) {
  return LINKS.map(({ href, label }) => {
    const active = pathname !== null && (pathname === href || pathname.startsWith(`${href}/`));
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={`shrink-0 rounded-md px-2.5 py-1.5 transition-colors ${
          active ? "bg-surface-muted text-fg" : "text-muted hover:bg-surface-muted hover:text-fg"
        }`}
      >
        {label}
      </Link>
    );
  });
}

/**
 * Reads the URL, so it must render inside <Suspense> (Cache Components): the
 * prerendered shell shows <NavLinkItems pathname={null} /> until it streams in.
 */
export function NavLinks() {
  return <NavLinkItems pathname={usePathname()} />;
}
