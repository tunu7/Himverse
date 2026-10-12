import Link from "next/link";

import { formatDuration, formatPriceFrom } from "@/lib/format";
import type { ItineraryView } from "@/server/itineraries/repository";

const TIME_LABELS = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  full_day: "Full day",
} as const;

function formatDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

export function ItineraryPlan({ itinerary }: { itinerary: ItineraryView }) {
  const { version } = itinerary;
  const total = formatPriceFrom(version.estimatedTotalMinor);

  return (
    <article className="flex flex-col gap-6">
      <section
        aria-label="Important"
        className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
      >
        <p>
          <strong>This is an AI-suggested plan, not a booking.</strong> Availability, opening times,
          travel times between places and permit requirements (including Inner Line Permits for
          Arunachal Pradesh) are not verified. Please check them before you travel.
        </p>
      </section>

      <dl className="grid gap-4 rounded-lg border border-zinc-200 p-4 sm:grid-cols-3 dark:border-zinc-800">
        <div>
          <dt className="text-sm text-zinc-500">Dates</dt>
          <dd className="font-medium">
            {version.days[0] ? formatDate(version.days[0].date) : "—"}
            {version.days.length > 1 ? ` – ${formatDate(version.days.at(-1)!.date)}` : null}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-zinc-500">Travellers</dt>
          <dd className="font-medium">{version.travelers}</dd>
        </div>
        <div>
          <dt className="text-sm text-zinc-500">Indicative cost of experiences</dt>
          <dd className="font-medium" data-testid="itinerary-total">
            From {total} for {version.travelers}{" "}
            {version.travelers === 1 ? "traveller" : "travellers"}
          </dd>
          {version.unpricedItemCount > 0 ? (
            <dd className="text-xs text-zinc-500">
              Excludes {version.unpricedItemCount} experience
              {version.unpricedItemCount === 1 ? "" : "s"} with price on request
            </dd>
          ) : null}
        </div>
      </dl>

      {version.plan.summary ? (
        <p className="text-zinc-700 dark:text-zinc-300">{version.plan.summary}</p>
      ) : null}

      <ol className="flex flex-col gap-4">
        {version.days.map((day) => (
          <li
            key={day.dayNumber}
            data-testid="itinerary-day"
            className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
          >
            <h2 className="text-lg font-semibold">
              Day {day.dayNumber} · {formatDate(day.date)}
            </h2>
            {day.items.length === 0 ? (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Free day: rest, travel or explore at your own pace.
              </p>
            ) : (
              <ul className="mt-2 flex flex-col gap-3">
                {day.items.map((item, index) => {
                  const price = formatPriceFrom(item.priceFromMinor);
                  return (
                    <li key={index} data-testid="itinerary-item">
                      <p className="font-medium">
                        {TIME_LABELS[item.timeOfDay]}:{" "}
                        {item.stillAvailable && item.experienceSlug ? (
                          <Link href={`/experiences/${item.experienceSlug}`} className="underline">
                            {item.title}
                          </Link>
                        ) : (
                          <>
                            {item.title}{" "}
                            <span className="text-sm text-red-700 dark:text-red-400">
                              (no longer available)
                            </span>
                          </>
                        )}
                      </p>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        {item.destinationName} · {formatDuration(item.durationMinutes)} ·{" "}
                        {price ? `from ${price} per person` : "price on request"}
                      </p>
                      {item.rationale ? (
                        <p className="text-sm text-zinc-700 dark:text-zinc-300">{item.rationale}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            {day.note ? (
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{day.note}</p>
            ) : null}
          </li>
        ))}
      </ol>

      {version.plan.cautions.length > 0 || version.warnings.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Things to check</h2>
          <ul className="list-disc pl-5 text-sm text-zinc-700 dark:text-zinc-300">
            {[...version.warnings, ...version.plan.cautions].map((text, i) => (
              <li key={i}>{text}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
