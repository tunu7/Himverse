import Link from "next/link";

import type { DestinationSummary } from "@/server/catalog/catalog";

export function DestinationCard({ destination }: { destination: DestinationSummary }) {
  const count = destination.experienceCount;
  return (
    <li>
      <article
        data-testid="destination-card"
        className="flex h-full flex-col gap-2 rounded-lg border border-zinc-200 p-4 transition-colors hover:border-emerald-600 dark:border-zinc-800"
      >
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          <Link href={`/destinations/${destination.slug}`} className="hover:underline">
            {destination.name}
          </Link>
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{destination.district} district</p>
        {destination.summary ? (
          <p className="text-zinc-700 dark:text-zinc-300">{destination.summary}</p>
        ) : null}
        <p className="mt-auto text-sm text-zinc-600 dark:text-zinc-400">
          {count === 0
            ? "No experiences yet"
            : `${count} ${count === 1 ? "experience" : "experiences"}`}
        </p>
      </article>
    </li>
  );
}
