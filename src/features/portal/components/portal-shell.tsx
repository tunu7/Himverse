import Link from "next/link";
import { Suspense } from "react";

import { BrandLogo } from "@/components/brand";
import { signOut } from "@/features/auth/actions";

import { type PortalLink, PortalNav, PortalNavItems } from "./portal-nav";

const AREA = {
  admin: {
    label: "Admin console",
    account: "/admin/account",
    bar: "bg-ink/95 text-white border-white/10 backdrop-blur-xl",
    badge: "bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-300/25",
    link: "text-white/60 hover:bg-white/10 hover:text-white",
  },
  partner: {
    label: "Partner portal",
    account: "/provider/account",
    bar: "bg-canvas/80 text-fg border-line backdrop-blur-xl backdrop-saturate-150",
    badge: "bg-accent-soft text-accent-soft-fg ring-1 ring-accent/15",
    link: "text-muted hover:bg-surface-muted hover:text-fg",
  },
} as const;

/**
 * Frame for the admin console and the tourism-partner portal: their own top bar
 * and section tabs instead of the traveller site header, so each area is
 * clearly separate.
 */
export function PortalShell({
  area,
  links,
  children,
}: {
  area: keyof typeof AREA;
  links: readonly PortalLink[];
  children: React.ReactNode;
}) {
  const style = AREA[area];
  return (
    <div className="flex min-h-full flex-1 flex-col bg-canvas">
      <header className={`sticky top-0 z-40 border-b ${style.bar}`}>
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-3 sm:px-6 lg:pb-3">
          <Link href={links[0]?.href ?? "/"} className="group flex items-center gap-2.5">
            <BrandLogo
              className={
                area === "admin"
                  ? "[&>span:first-child]:bg-white [&>span:first-child]:text-ink"
                  : ""
              }
            />
            <span
              className={`hidden rounded-full px-2.5 py-0.5 text-xs font-medium sm:inline-block ${style.badge}`}
            >
              {style.label}
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-1 text-sm">
            <Link href="/" className={`rounded-full px-3 py-1.5 transition-colors ${style.link}`}>
              View site
            </Link>
            <Link
              href={style.account}
              className={`rounded-full px-3 py-1.5 transition-colors ${style.link}`}
            >
              Account
            </Link>
            <form action={signOut}>
              <button
                type="submit"
                className={`rounded-full px-3 py-1.5 transition-colors ${style.link}`}
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
        {/* Small screens: scrolling tabs under the bar. */}
        <nav
          aria-label={style.label}
          className="mx-auto flex w-full max-w-6xl gap-6 overflow-x-auto px-4 sm:px-6 lg:hidden"
        >
          <Suspense
            fallback={
              <PortalNavItems links={links} pathname={null} tone={area} orientation="horizontal" />
            }
          >
            <PortalNav links={links} tone={area} orientation="horizontal" />
          </Suspense>
        </nav>
        <div className="h-3 lg:hidden" aria-hidden="true" />
      </header>
      <div className="mx-auto flex w-full max-w-7xl flex-1 lg:gap-6 lg:px-6">
        {/* Large screens: a sidebar. */}
        <aside className="hidden w-56 shrink-0 py-10 lg:block">
          <nav aria-label={style.label} className="sticky top-24 flex flex-col gap-1">
            <Suspense
              fallback={
                <PortalNavItems links={links} pathname={null} tone={area} orientation="vertical" />
              }
            >
              <PortalNav links={links} tone={area} orientation="vertical" />
            </Suspense>
          </nav>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
      <footer className="border-t border-line">
        <p className="mx-auto w-full max-w-7xl px-4 py-6 text-xs text-subtle sm:px-6">
          Himverse.AI · {style.label}
        </p>
      </footer>
    </div>
  );
}
