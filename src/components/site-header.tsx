import Link from "next/link";
import { Suspense } from "react";

import { NavLinkItems, NavLinks } from "@/components/nav-links";
import { getCurrentUser } from "@/server/auth/session";

async function AuthLinks() {
  const user = await getCurrentUser();
  return user ? (
    <Link
      href="/account"
      className="rounded-md px-2.5 py-1.5 text-muted transition-colors hover:bg-surface-muted hover:text-fg"
    >
      Account
    </Link>
  ) : (
    <Link
      href="/sign-in"
      className="rounded-lg bg-accent px-3 py-1.5 font-medium text-white transition-colors hover:bg-accent-hover dark:text-zinc-950"
    >
      Sign in
    </Link>
  );
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
