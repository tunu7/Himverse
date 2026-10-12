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
      <nav className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-6 py-4 text-sm">
        <Link href="/" className="font-semibold text-zinc-900 dark:text-zinc-50">
          Himverse.AI
        </Link>
        <div className="flex items-center gap-5 text-zinc-700 dark:text-zinc-300">
          <Link href="/explore" className="hover:underline">
            Explore
          </Link>
          <Suspense fallback={<span className="w-14" aria-hidden />}>
            <AuthLinks />
          </Suspense>
        </div>
      </nav>
    </header>
  );
}
