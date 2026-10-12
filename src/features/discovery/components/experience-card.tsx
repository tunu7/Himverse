import Link from "next/link";

import { formatCategory, formatDuration, formatPriceFrom } from "@/lib/format";
import type { ExperienceSummary } from "@/server/catalog/catalog";

export function ExperienceCard({ experience }: { experience: ExperienceSummary }) {
  const price = formatPriceFrom(experience.priceFromMinor);
  return (
    <li>
      <article
        data-testid="experience-card"
        className="flex h-full flex-col gap-2 rounded-lg border border-zinc-200 p-4 transition-colors hover:border-emerald-600 dark:border-zinc-800"
      >
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          <Link href={`/experiences/${experience.slug}`} className="hover:underline">
            {experience.title}
          </Link>
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {experience.destination.name}, {experience.destination.district} ·{" "}
          {experience.provider.displayName}
        </p>
        {experience.summary ? (
          <p className="text-zinc-700 dark:text-zinc-300">{experience.summary}</p>
        ) : null}
        <p className="mt-auto text-sm text-zinc-600 dark:text-zinc-400">
          {formatCategory(experience.category)} · {formatDuration(experience.durationMinutes)} ·{" "}
          {price ? `from ${price}` : "Price on request"}
        </p>
      </article>
    </li>
  );
}
