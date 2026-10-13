"use client";

import Link from "next/link";
import { useRef } from "react";

type MenuLink = { href: string; label: string; tone?: "accent" };

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
  return (
    <details ref={ref} className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-line py-1 pr-2.5 pl-1 text-fg transition hover:bg-surface-muted [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden="true"
          className="flex size-7 items-center justify-center rounded-full bg-accent text-xs font-bold text-white uppercase dark:text-zinc-950"
        >
          {initial}
        </span>
        <span className="text-sm font-medium">Account</span>
        <svg
          viewBox="0 0 20 20"
          aria-hidden="true"
          className="size-4 text-subtle transition group-open:rotate-180"
        >
          <path d="m5 8 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      </summary>
      <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-lg">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            onClick={close}
            className={`block rounded-lg px-3 py-2 text-sm transition-colors hover:bg-surface-muted ${
              link.tone === "accent" ? "font-semibold text-accent" : "text-fg"
            }`}
          >
            {link.label}
          </Link>
        ))}
        <form action={signOut} className="mt-1 border-t border-line pt-1">
          <button
            type="submit"
            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-muted transition-colors hover:bg-surface-muted hover:text-fg"
          >
            Sign out
          </button>
        </form>
      </div>
    </details>
  );
}
