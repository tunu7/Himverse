import { connection } from "next/server";
import { Suspense } from "react";

import { LoadingBlock, PageShell } from "@/components/page-shell";
import { formatDuration, formatPriceFrom } from "@/lib/format";
import { listPublicExperiences } from "@/server/catalog/catalog";

async function ExperienceList() {
  // Read at request time so builds never need a database. Public catalogue
  // caching ('use cache' + tags) is a later optimisation.
  await connection();
  const experiences = await listPublicExperiences();

  if (experiences.length === 0) {
    return (
      <p className="text-zinc-600 dark:text-zinc-400">
        No experiences are published yet. Verified providers are adding them — check back soon.
      </p>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {experiences.map((e) => {
        const price = formatPriceFrom(e.priceFromMinor);
        return (
          <li
            key={e.id}
            data-testid="experience-card"
            className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
          >
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{e.title}</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {e.destination.name}, {e.destination.district} · {e.provider.displayName}
            </p>
            {e.summary ? <p className="text-zinc-700 dark:text-zinc-300">{e.summary}</p> : null}
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {e.category.replaceAll("_", " ")} · {formatDuration(e.durationMinutes)}
              {price ? ` · indicative price from ${price}` : null}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

export default function ExplorePage() {
  return (
    <PageShell title="Explore Arunachal Pradesh">
      <p className="text-zinc-600 dark:text-zinc-400">
        Experiences from verified local providers. Prices are indicative; nothing here is a booking
        or an availability guarantee.
      </p>
      <Suspense fallback={<LoadingBlock label="Loading experiences…" />}>
        <ExperienceList />
      </Suspense>
    </PageShell>
  );
}
