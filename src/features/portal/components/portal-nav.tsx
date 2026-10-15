"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type PortalLink = { href: string; label: string; exact?: boolean };

/** Section tabs; `pathname` (when known) highlights the current one. */
type NavProps = {
  links: readonly PortalLink[];
  tone: "admin" | "partner";
  /** Sidebar on large screens, scrolling tabs on small ones. */
  orientation: "vertical" | "horizontal";
};

const STYLES = {
  horizontal: {
    base: "shrink-0 border-b-2 px-1 py-3 text-sm font-medium transition-colors duration-200",
    admin: ["border-emerald-300 text-white", "border-transparent text-white/50 hover:text-white"],
    partner: ["border-fg text-fg", "border-transparent text-muted hover:text-fg"],
  },
  vertical: {
    base: "flex items-center rounded-xl px-3 py-2 text-sm font-medium transition-colors duration-200",
    // The sidebar sits on the page background, not the dark admin bar.
    admin: ["bg-fg text-canvas", "text-muted hover:bg-surface-muted hover:text-fg"],
    partner: ["bg-surface-muted text-fg", "text-muted hover:bg-surface-muted/60 hover:text-fg"],
  },
} as const;

/** Section links; `pathname` (when known) highlights the current one. */
export function PortalNavItems({
  links,
  pathname,
  tone,
  orientation,
}: NavProps & { pathname: string | null }) {
  const style = STYLES[orientation];
  const [activeClass, idleClass] = style[tone];
  return links.map(({ href, label, exact }) => {
    const active =
      pathname !== null &&
      (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={`${style.base} ${active ? activeClass : idleClass}`}
      >
        {label}
      </Link>
    );
  });
}

/** Reads the URL, so it renders inside <Suspense> (Cache Components). */
export function PortalNav(props: NavProps) {
  return <PortalNavItems {...props} pathname={usePathname()} />;
}
