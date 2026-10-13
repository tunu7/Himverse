"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type PortalLink = { href: string; label: string; exact?: boolean };

/** Section tabs; `pathname` (when known) highlights the current one. */
export function PortalNavItems({
  links,
  pathname,
  tone,
}: {
  links: readonly PortalLink[];
  pathname: string | null;
  tone: "admin" | "partner";
}) {
  return links.map(({ href, label, exact }) => {
    const active =
      pathname !== null &&
      (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
    const activeClass = tone === "admin" ? "border-emerald-300 text-white" : "border-fg text-fg";
    const idleClass =
      tone === "admin"
        ? "border-transparent text-white/50 hover:text-white"
        : "border-transparent text-muted hover:text-fg";
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={`shrink-0 border-b-2 px-1 py-3 text-sm font-medium transition-colors duration-200 ${
          active ? activeClass : idleClass
        }`}
      >
        {label}
      </Link>
    );
  });
}

/** Reads the URL, so it renders inside <Suspense> (Cache Components). */
export function PortalNav(props: { links: readonly PortalLink[]; tone: "admin" | "partner" }) {
  return <PortalNavItems {...props} pathname={usePathname()} />;
}
