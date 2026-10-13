import Link from "next/link";

import { formatCategory, formatDuration, formatPriceFrom } from "@/lib/format";
import type { ExperienceSummary } from "@/server/catalog/catalog";

import { CategoryBand } from "./category-visual";

export function ExperienceCard({ experience }: { experience: ExperienceSummary }) {
  const price = formatPriceFrom(experience.priceFromMinor);
  return (
    <li className="reveal">
      <article
        data-testid="experience-card"
        className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-line bg-surface transition duration-300 ease-out hover:-translate-y-1 hover:border-line-strong hover:shadow-xl hover:shadow-black/5"
      >
        <CategoryBand category={experience.category} />
        <span className="absolute top-3 left-3 rounded-full bg-surface/85 px-2.5 py-1 text-xs font-medium text-fg backdrop-blur">
          {formatCategory(experience.category)}
        </span>
        <div className="flex flex-1 flex-col gap-2 p-5">
          <p className="text-xs text-subtle">
            {experience.destination.name}, {experience.destination.district}
          </p>
          <h2 className="text-lg leading-snug font-semibold tracking-tight text-fg">
            {/* Stretched link: the whole card is clickable, with one accessible link. */}
            <Link
              href={`/experiences/${experience.slug}`}
              className="after:absolute after:inset-0 after:rounded-3xl"
            >
              {experience.title}
            </Link>
          </h2>
          {experience.summary ? (
            <p className="line-clamp-2 text-sm leading-6 text-muted">{experience.summary}</p>
          ) : null}
          <p className="text-xs text-subtle">by {experience.provider.displayName}</p>
          <p className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-4 text-sm">
            <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs text-fg-soft">
              {formatDuration(experience.durationMinutes)}
            </span>
            <span className="flex items-center gap-2 font-semibold text-fg">
              {price ? `from ${price}` : "Price on request"}
              <span
                aria-hidden="true"
                className="flex size-7 items-center justify-center rounded-full bg-fg text-canvas transition duration-300 group-hover:translate-x-0.5 group-hover:bg-accent group-hover:text-on-accent"
              >
                →
              </span>
            </span>
          </p>
        </div>
      </article>
    </li>
  );
}
