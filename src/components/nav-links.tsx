"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";

const LINKS = [
  { href: "/destinations", label: "Destinations" },
  { href: "/experiences", label: "Experiences" },
  { href: "/stays", label: "Stays" },
  { href: "/guides", label: "Guides" },
  { href: "/transport", label: "Transport" },
  { href: "/itineraries/new", label: "Plan a trip" },
] as const;

function isActive(pathname: string | null, href: string) {
  return pathname !== null && (pathname === href || pathname.startsWith(`${href}/`));
}

/** The main links; `pathname` (when known) highlights the current section. */
export function NavLinkItems({ pathname }: { pathname: string | null }) {
  return LINKS.map(({ href, label }) => {
    const active = isActive(pathname, href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={`relative shrink-0 rounded-full px-3.5 py-1.5 transition-colors duration-200 ${
          active ? "bg-surface-muted text-fg" : "text-muted hover:text-fg"
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

/**
 * Phone menu: a native <details> (works without JavaScript) that drops a sheet
 * with the main links. Links close it so it doesn't stay open after navigating.
 */
export function MobileMenu({ pathname }: { pathname: string | null }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const close = () => ref.current?.removeAttribute("open");
  return (
    <details ref={ref} className="group md:hidden">
      <summary
        aria-label="Menu"
        className="flex size-9 cursor-pointer list-none items-center justify-center rounded-full border border-line text-fg transition hover:bg-surface-muted [&::-webkit-details-marker]:hidden"
      >
        <svg viewBox="0 0 20 20" aria-hidden="true" className="size-4">
          <path
            d="M3 6h14M3 14h14"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            className="group-open:hidden"
          />
          <path
            d="m5 5 10 10M15 5 5 15"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            className="hidden group-open:block"
          />
        </svg>
      </summary>
      <div className="absolute inset-x-0 top-full border-b border-line bg-canvas px-4 pt-2 pb-5 shadow-xl shadow-black/5 backdrop-blur-xl group-open:animate-pop">
        <ul className="flex flex-col">
          {LINKS.map(({ href, label }, i) => {
            const active = isActive(pathname, href);
            return (
              <li
                key={href}
                className="group-open:animate-rise"
                style={{ animationDelay: `${60 + i * 50}ms` }}
              >
                <Link
                  href={href}
                  onClick={close}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center justify-between border-b border-line py-3.5 text-lg tracking-tight ${
                    active ? "font-semibold text-fg" : "text-fg-soft"
                  }`}
                >
                  {label}
                  <span aria-hidden="true" className="text-subtle">
                    →
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}

export function MobileNav() {
  return <MobileMenu pathname={usePathname()} />;
}
