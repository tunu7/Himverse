import Link from "next/link";

const POINTS = [
  "Trip plans built only from real, listed experiences",
  "Every provider reviewed by our team",
  "Request dates; providers confirm the final price",
] as const;

/** Sign-in and sign-up: a focused split layout without the site navigation. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-full flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-emerald-800 via-emerald-900 to-teal-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -top-24 -left-24 size-96 rounded-full bg-emerald-400/20 blur-3xl" />
        <svg
          viewBox="0 0 800 240"
          preserveAspectRatio="none"
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-48 w-full"
        >
          <path
            d="M0 240 L120 110 L210 180 L330 60 L450 170 L560 90 L680 160 L800 80 L800 240 Z"
            fill="white"
            opacity="0.06"
          />
          <path
            d="M0 240 L90 170 L190 210 L300 130 L420 210 L520 150 L640 200 L740 140 L800 170 L800 240 Z"
            fill="white"
            opacity="0.08"
          />
        </svg>
        <Link href="/" className="relative flex items-center gap-2 text-lg font-semibold">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-7 text-emerald-300">
            <path
              d="M2 20 9 7l4 7 2.5-4L22 20Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
          Himverse.AI
        </Link>
        <div className="relative flex flex-col gap-6">
          <p className="max-w-md text-3xl leading-tight font-semibold tracking-tight">
            Trusted Himalayan experiences, planned around you.
          </p>
          <ul className="flex flex-col gap-3 text-emerald-50/90">
            {POINTS.map((point) => (
              <li key={point} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/20 text-xs text-emerald-200"
                >
                  ✓
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-emerald-100/70">Starting in Arunachal Pradesh.</p>
      </aside>

      <div className="flex flex-col">
        <div className="flex items-center justify-between px-4 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-2 font-semibold text-fg lg:invisible">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6 text-accent">
              <path
                d="M2 20 9 7l4 7 2.5-4L22 20Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
            Himverse.AI
          </Link>
          <Link href="/" className="text-sm font-medium text-muted hover:text-fg">
            ← Back to site
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center px-4 pb-16 sm:px-8">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </div>
    </div>
  );
}
