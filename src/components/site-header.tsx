import Link from "next/link";
import { Suspense } from "react";

import { getCurrentUser } from "@/server/auth/session";

async function AuthLinks() {
  const user = await getCurrentUser();
  return user ? (
    <Link href="/account" className="hover:underline">
      Account
    </Link>
  ) : (
    <Link href="/sign-in" className="hover:underline">
      Sign in
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <nav
        aria-label="Main"
        className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-4 text-sm sm:px-6"
      >
        <Link href="/" className="font-semibold text-zinc-900 dark:text-zinc-50">
          Himverse.AI
        </Link>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-zinc-700 sm:gap-x-5 dark:text-zinc-300">
          <Link href="/destinations" className="hover:underline">
            Destinations
          </Link>
          <Link href="/experiences" className="hover:underline">
            Experiences
          </Link>
          <Link href="/itineraries" className="hover:underline">
            Trips
          </Link>
          <Suspense fallback={<span className="w-14" aria-hidden />}>
            <AuthLinks />
          </Suspense>
        </div>
      </nav>
    </header>
  );
}
