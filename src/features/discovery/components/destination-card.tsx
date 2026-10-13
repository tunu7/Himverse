import Link from "next/link";

import type { DestinationSummary } from "@/server/catalog/catalog";

export function DestinationCard({ destination }: { destination: DestinationSummary }) {
  const count = destination.experienceCount;
  return (
    <li>
      <article
        data-testid="destination-card"
        className="group relative flex h-full flex-col gap-2 overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-xs transition duration-200 before:absolute before:inset-x-0 before:top-0 before:h-1 before:bg-gradient-to-r before:from-accent before:to-teal-400 hover:-translate-y-1 hover:border-accent/40 hover:shadow-lg"
      >
        <p className="text-xs font-medium tracking-wide text-subtle uppercase">
          {destination.district} district
        </p>
        <h2 className="text-xl leading-snug font-semibold tracking-tight text-fg">
          {/* Stretched link: the whole card is clickable, with one accessible link. */}
          <Link
            href={`/destinations/${destination.slug}`}
            className="after:absolute after:inset-0 after:rounded-2xl group-hover:text-accent"
          >
            {destination.name}
          </Link>
        </h2>
        {destination.summary ? (
          <p className="line-clamp-3 text-sm leading-6 text-fg-soft">{destination.summary}</p>
        ) : null}
        <p className="mt-auto flex items-center justify-between pt-3 text-sm font-medium text-accent">
          {count === 0
            ? "No experiences yet"
            : `${count} ${count === 1 ? "experience" : "experiences"}`}
          <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
            →
          </span>
        </p>
      </article>
    </li>
  );
}
