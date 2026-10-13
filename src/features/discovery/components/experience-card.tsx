import Link from "next/link";

import { formatCategory, formatDuration, formatPriceFrom } from "@/lib/format";
import type { ExperienceSummary } from "@/server/catalog/catalog";

export function ExperienceCard({ experience }: { experience: ExperienceSummary }) {
  const price = formatPriceFrom(experience.priceFromMinor);
  return (
    <li>
      <article
        data-testid="experience-card"
        className="group relative flex h-full flex-col gap-3 rounded-xl border border-line bg-surface p-5 shadow-xs transition hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-md"
      >
        <span className="self-start rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent-soft-fg">
          {formatCategory(experience.category)}
        </span>
        <h2 className="text-lg leading-snug font-semibold text-fg">
          {/* Stretched link: the whole card is clickable, with one accessible link. */}
          <Link
            href={`/experiences/${experience.slug}`}
            className="after:absolute after:inset-0 after:rounded-xl group-hover:text-accent"
          >
            {experience.title}
          </Link>
        </h2>
        <p className="text-sm text-muted">
          {experience.destination.name}, {experience.destination.district} ·{" "}
          {experience.provider.displayName}
        </p>
        {experience.summary ? (
          <p className="line-clamp-3 text-sm leading-6 text-fg-soft">{experience.summary}</p>
        ) : null}
        <p className="mt-auto flex flex-wrap items-center gap-x-2 border-t border-line pt-3 text-sm text-muted">
          <span>{formatDuration(experience.durationMinutes)}</span>
          <span aria-hidden="true">·</span>
          <span className="font-medium text-fg">
            {price ? `from ${price}` : "Price on request"}
          </span>
        </p>
      </article>
    </li>
  );
}
