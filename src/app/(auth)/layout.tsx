import Link from "next/link";

import { BrandLogo } from "@/components/brand";

const POINTS = [
  "Trip plans built only from real, listed experiences",
  "Every provider reviewed by our team",
  "Request dates; providers confirm the final price",
] as const;

/** Sign-in and sign-up: a focused split layout without the site navigation. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-full flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative isolate hidden overflow-hidden bg-ink p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -top-32 -left-24 -z-10 size-[28rem] rounded-full bg-emerald-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -right-24 bottom-24 -z-10 size-72 rounded-full bg-teal-400/10 blur-3xl" />
        <svg
          viewBox="0 0 1200 240"
          preserveAspectRatio="none"
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-0 -z-10 h-56 w-[120%] animate-drift text-emerald-200"
        >
          <path
            d="M0 240 L120 110 L210 180 L330 60 L450 170 L560 90 L680 160 L800 80 L920 170 L1040 100 L1200 160 L1200 240 Z"
            fill="currentColor"
            opacity="0.06"
          />
          <path
            d="M0 240 L90 170 L190 210 L300 130 L420 210 L520 150 L640 200 L740 140 L860 200 L980 150 L1200 190 L1200 240 Z"
            fill="currentColor"
            opacity="0.08"
          />
        </svg>
        <Link href="/" className="group relative animate-fade text-lg">
          <BrandLogo className="[&>span:first-child]:bg-white [&>span:first-child]:text-ink" />
        </Link>
        <div className="relative flex animate-rise flex-col gap-8">
          <p className="max-w-md text-4xl leading-[1.1] font-semibold tracking-[-0.03em]">
            Trusted Himalayan experiences,{" "}
            <span className="font-display font-normal text-emerald-300 italic">
              planned around you.
            </span>
          </p>
          <ul className="flex flex-col gap-3.5 text-white/75">
            {POINTS.map((point, i) => (
              <li
                key={point}
                className="flex animate-rise items-start gap-3"
                style={{ animationDelay: `${150 + i * 80}ms` }}
              >
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-[10px] text-emerald-300 ring-1 ring-emerald-300/30"
                >
                  ✓
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/50">Starting in Arunachal Pradesh.</p>
      </aside>

      <div className="flex flex-col">
        <div className="flex h-16 items-center justify-between px-4 sm:px-8">
          <Link href="/" className="group text-fg lg:invisible">
            <BrandLogo />
          </Link>
          <Link
            href="/"
            className="rounded-full px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-muted hover:text-fg"
          >
            ← Back to site
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center px-4 pb-16 sm:px-8">
          <div className="w-full max-w-md animate-rise">{children}</div>
        </div>
      </div>
    </div>
  );
}
