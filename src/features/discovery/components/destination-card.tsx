import Link from "next/link";

import type { DestinationSummary } from "@/server/catalog/catalog";

export function DestinationCard({ destination }: { destination: DestinationSummary }) {
  const count = destination.experienceCount;
  return (
    <li>
      <article
        data-testid="destination-card"
        className="group relative flex h-full flex-col gap-2 rounded-xl border border-line bg-surface p-5 shadow-xs transition hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-md"
      >
        <p className="text-xs font-medium tracking-wide text-subtle uppercase">
          {destination.district} district
        </p>
        <h2 className="text-lg leading-snug font-semibold text-fg">
          {/* Stretched link: the whole card is clickable, with one accessible link. */}
          <Link
            href={`/destinations/${destination.slug}`}
            className="after:absolute after:inset-0 after:rounded-xl group-hover:text-accent"
          >
            {destination.name}
          </Link>
        </h2>
        {destination.summary ? (
          <p className="line-clamp-3 text-sm leading-6 text-fg-soft">{destination.summary}</p>
        ) : null}
        <p className="mt-auto border-t border-line pt-3 text-sm font-medium text-muted">
          {count === 0
            ? "No experiences yet"
            : `${count} ${count === 1 ? "experience" : "experiences"}`}
        </p>
      </article>
    </li>
  );
}
