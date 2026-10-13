import Link from "next/link";

import type { DestinationSummary } from "@/server/catalog/catalog";

import { Ridges } from "./category-visual";

/** Decorative skies, picked deterministically from the slug so a card always looks the same. */
const SKIES = [
  "from-emerald-200 via-teal-100 to-sky-100 dark:from-emerald-900/70 dark:via-zinc-900 dark:to-sky-950",
  "from-sky-200 via-indigo-100 to-violet-100 dark:from-sky-900/70 dark:via-zinc-900 dark:to-violet-950",
  "from-amber-100 via-rose-100 to-violet-200 dark:from-amber-900/60 dark:via-zinc-900 dark:to-violet-950",
  "from-teal-200 via-cyan-100 to-emerald-100 dark:from-teal-900/70 dark:via-zinc-900 dark:to-emerald-950",
] as const;

function skyFor(slug: string) {
  let hash = 0;
  for (const char of slug) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return SKIES[hash % SKIES.length] ?? SKIES[0];
}

/** Decorative sky-and-ridges band for a destination (cards and the detail page). */
export function DestinationBand({
  slug,
  className = "h-32",
}: {
  slug: string;
  className?: string;
}) {
  return (
    <div aria-hidden="true" className={`relative overflow-hidden ${className}`}>
      <div
        className={`absolute inset-0 bg-gradient-to-b text-black/55 transition-transform duration-700 ease-out group-hover:scale-[1.06] dark:text-white/40 ${skyFor(slug)}`}
      >
        <span className="absolute top-[18%] right-[8%] size-6 rounded-full bg-white/70 blur-[1px] dark:bg-white/20" />
        <Ridges />
      </div>
    </div>
  );
}

export function DestinationCard({ destination }: { destination: DestinationSummary }) {
  const count = destination.experienceCount;
  return (
    <li className="reveal">
      <article
        data-testid="destination-card"
        className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-line bg-surface transition duration-300 ease-out hover:-translate-y-1 hover:border-line-strong hover:shadow-xl hover:shadow-black/5"
      >
        <DestinationBand slug={destination.slug} />
        <div className="flex flex-1 flex-col gap-2 p-5">
          <p className="text-xs text-subtle">{destination.district} district</p>
          <h2 className="text-xl leading-snug font-semibold tracking-tight text-fg">
            {/* Stretched link: the whole card is clickable, with one accessible link. */}
            <Link
              href={`/destinations/${destination.slug}`}
              className="after:absolute after:inset-0 after:rounded-3xl"
            >
              {destination.name}
            </Link>
          </h2>
          {destination.summary ? (
            <p className="line-clamp-3 text-sm leading-6 text-muted">{destination.summary}</p>
          ) : null}
          <p className="mt-auto flex items-center justify-between pt-3 text-sm font-medium text-fg-soft">
            {count === 0
              ? "No experiences yet"
              : `${count} ${count === 1 ? "experience" : "experiences"}`}
            <span
              aria-hidden="true"
              className="text-subtle transition duration-300 group-hover:translate-x-1 group-hover:text-accent"
            >
              →
            </span>
          </p>
        </div>
      </article>
    </li>
  );
}
