import Link from "next/link";
import { Suspense } from "react";

import { signOut } from "@/features/auth/actions";

import { type PortalLink, PortalNav, PortalNavItems } from "./portal-nav";

const AREA = {
  admin: {
    label: "Admin console",
    bar: "bg-zinc-950 text-white border-zinc-800",
    badge: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30",
    link: "text-zinc-300 hover:bg-white/10 hover:text-white",
  },
  partner: {
    label: "Partner portal",
    bar: "bg-surface text-fg border-line",
    badge: "bg-accent-soft text-accent-soft-fg ring-1 ring-accent/20",
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
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-3 sm:px-6">
          <Link href={links[0]?.href ?? "/"} className="flex items-center gap-2.5">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6 text-emerald-500">
              <path d="M2 20 9 7l4 7 2.5-4L22 20Z" fill="currentColor" opacity="0.3" />
              <path
                d="M2 20 9 7l4 7 2.5-4L22 20Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
            <span className="font-semibold tracking-tight">Himverse.AI</span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${style.badge}`}>
              {style.label}
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-1 text-sm">
            <Link href="/" className={`rounded-md px-2.5 py-1.5 transition-colors ${style.link}`}>
              Back to site
            </Link>
            <Link
              href="/account"
              className={`rounded-md px-2.5 py-1.5 transition-colors ${style.link}`}
            >
              Account
            </Link>
            <form action={signOut}>
              <button
                type="submit"
                className={`rounded-md px-2.5 py-1.5 transition-colors ${style.link}`}
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
        <nav
          aria-label={style.label}
          className="mx-auto flex w-full max-w-6xl gap-6 overflow-x-auto px-4 sm:px-6"
        >
          <Suspense fallback={<PortalNavItems links={links} pathname={null} tone={area} />}>
            <PortalNav links={links} tone={area} />
          </Suspense>
        </nav>
      </header>
      {children}
      <footer className="border-t border-line">
        <p className="mx-auto w-full max-w-6xl px-4 py-6 text-xs text-subtle sm:px-6">
          Himverse.AI · {style.label}
        </p>
      </footer>
    </div>
  );
}
