"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const ADMIN_LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/providers", label: "Providers" },
  { href: "/admin/destinations", label: "Destinations" },
  { href: "/admin/experiences", label: "Experiences" },
  { href: "/admin/bookings", label: "Bookings" },
] as const;

/** Admin section tabs; `pathname` (when known) highlights the current one. */
export function AdminNavItems({ pathname }: { pathname: string | null }) {
  return ADMIN_LINKS.map(({ href, label }) => {
    const active =
      pathname !== null &&
      (href === "/admin"
        ? pathname === href
        : pathname === href || pathname.startsWith(`${href}/`));
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={`shrink-0 border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
          active ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"
        }`}
      >
        {label}
      </Link>
    );
  });
}

/** Reads the URL, so it renders inside <Suspense> (Cache Components). */
export function AdminNavLinks() {
  return <AdminNavItems pathname={usePathname()} />;
}
