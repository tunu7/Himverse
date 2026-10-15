"use client";

import Link from "next/link";
import { useRef } from "react";

type MenuLink = { href: string; label: string; tone?: "accent"; count?: number };

/**
 * Signed-in account menu. A native <details> (works without JavaScript); links
 * close it so it doesn't stay open after client-side navigation.
 */
export function AccountMenu({
  initial,
  links,
  signOut,
}: {
  initial: string;
  links: readonly MenuLink[];
  signOut: () => Promise<void>;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const close = () => ref.current?.removeAttribute("open");
  const alerts = links.reduce((sum, link) => sum + (link.count ?? 0), 0);
  return (
    <details ref={ref} className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-line bg-surface py-1 pr-2.5 pl-1 text-fg transition duration-200 hover:border-line-strong hover:shadow-sm [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden="true"
          className="flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-accent to-teal-500 text-xs font-semibold text-on-accent uppercase"
        >
          {initial}
        </span>
        <span className="text-sm font-medium">Account</span>
        {alerts > 0 ? (
          <span
            data-testid="account-alerts"
            className="flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-semibold text-on-accent"
          >
            {alerts}
            <span className="sr-only"> {alerts === 1 ? "update" : "updates"}</span>
          </span>
        ) : null}
        <svg
          viewBox="0 0 20 20"
          aria-hidden="true"
          className="size-4 text-subtle transition-transform duration-300 group-open:rotate-180"
        >
          <path d="m5 8 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      </summary>
      <div className="absolute right-0 z-50 mt-2 w-60 origin-top-right overflow-hidden rounded-2xl border border-line bg-surface/95 p-1.5 shadow-2xl shadow-black/10 backdrop-blur-xl group-open:animate-pop">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            onClick={close}
            className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors hover:bg-surface-muted ${
              link.tone === "accent" ? "font-medium text-accent" : "text-fg"
            }`}
          >
            {link.label}
            {link.count ? (
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-soft-fg">
                {link.count}
                <span className="sr-only"> new</span>
              </span>
            ) : null}
          </Link>
        ))}
        <form action={signOut} className="mt-1 border-t border-line pt-1">
          <button
            type="submit"
            className="block w-full rounded-xl px-3 py-2 text-left text-sm text-muted transition-colors hover:bg-surface-muted hover:text-fg"
          >
            Sign out
          </button>
        </form>
      </div>
    </details>
  );
}
