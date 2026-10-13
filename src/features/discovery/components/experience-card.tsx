import Link from "next/link";

import { formatCategory, formatDuration, formatPriceFrom } from "@/lib/format";
import type { ExperienceSummary } from "@/server/catalog/catalog";

import { CategoryBand } from "./category-visual";

export function ExperienceCard({ experience }: { experience: ExperienceSummary }) {
  const price = formatPriceFrom(experience.priceFromMinor);
  return (
    <li>
      <article
        data-testid="experience-card"
        className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-xs transition duration-200 hover:-translate-y-1 hover:border-accent/40 hover:shadow-lg"
      >
        <CategoryBand category={experience.category} />
        <span className="absolute top-3 left-3 rounded-full bg-surface/90 px-2.5 py-1 text-xs font-semibold text-fg shadow-xs backdrop-blur">
          {formatCategory(experience.category)}
        </span>
        <div className="flex flex-1 flex-col gap-2 p-5">
          <h2 className="text-lg leading-snug font-semibold text-fg">
            {/* Stretched link: the whole card is clickable, with one accessible link. */}
            <Link
              href={`/experiences/${experience.slug}`}
              className="after:absolute after:inset-0 after:rounded-2xl group-hover:text-accent"
            >
              {experience.title}
            </Link>
          </h2>
          <p className="text-sm text-muted">
            {experience.destination.name}, {experience.destination.district} ·{" "}
            {experience.provider.displayName}
          </p>
          {experience.summary ? (
            <p className="line-clamp-2 text-sm leading-6 text-fg-soft">{experience.summary}</p>
          ) : null}
          <p className="mt-auto flex items-center justify-between gap-2 pt-3 text-sm">
            <span className="text-muted">{formatDuration(experience.durationMinutes)}</span>
            <span className="font-semibold text-fg">
              {price ? `from ${price}` : "Price on request"}
            </span>
          </p>
        </div>
      </article>
    </li>
  );
}
