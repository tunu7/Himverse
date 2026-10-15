import Link from "next/link";

import { formatDuration, formatPriceFrom } from "@/lib/format";
import type { ItineraryItemView, ItineraryView } from "@/server/itineraries/repository";

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

function plural(n: number, one: string): string {
  return `${n} ${one}${n === 1 ? "" : "s"}`;
}

/** The day's transport or the night's stay: a listing booked by vehicles or rooms. */
function ListingLine({
  label,
  item,
  unitOne,
  priceUnit,
  testId,
}: {
  label: string;
  item: ItineraryItemView;
  unitOne: string;
  priceUnit: string;
  testId: string;
}) {
  const price = formatPriceFrom(item.priceFromMinor);
  return (
    <p data-testid={testId} className="text-sm">
      <span className="font-medium">{label}: </span>
      {item.stillAvailable && item.experienceSlug ? (
        <Link
          href={`/experiences/${item.experienceSlug}`}
          className="font-medium text-accent underline-offset-4 hover:underline"
        >
          {item.title}
        </Link>
      ) : (
        <>
          {item.title} <span className="text-danger">(no longer available)</span>
        </>
      )}
      <span className="text-muted">
        {" "}
        · {plural(item.units, unitOne)} ·{" "}
        {price ? `from ${price} ${priceUnit}` : "price on request"}
      </span>
    </p>
  );
}

export function ItineraryPlan({ itinerary }: { itinerary: ItineraryView }) {
  const { version } = itinerary;
  const total = formatPriceFrom(version.estimatedTotalMinor);

  return (
    <article className="flex flex-col gap-6">
      <section
        aria-label="Important"
        className="rounded-lg border border-warning-line bg-warning-soft p-3 text-sm text-warning-soft-fg"
      >
        <p>
          <strong>This is an AI-suggested plan, not a booking.</strong> Availability, opening times,
          travel times between places and permit requirements (including Inner Line Permits for
          Arunachal Pradesh) are not verified. Please check them before you travel.
        </p>
      </section>

      <dl className="grid gap-4 rounded-2xl border border-line bg-surface p-5 sm:grid-cols-3">
        <div>
          <dt className="text-xs font-medium tracking-wide text-subtle uppercase">Dates</dt>
          <dd className="font-medium">
            {version.days[0] ? formatDate(version.days[0].date) : "—"}
            {version.days.length > 1 ? ` – ${formatDate(version.days.at(-1)!.date)}` : null}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium tracking-wide text-subtle uppercase">Travellers</dt>
          <dd className="font-medium">{version.travelers}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium tracking-wide text-subtle uppercase">
            Indicative cost
          </dt>
          <dd className="font-medium" data-testid="itinerary-total">
            From {total} for {version.travelers}{" "}
            {version.travelers === 1 ? "traveller" : "travellers"}
          </dd>
          {version.unpricedItemCount > 0 ? (
            <dd className="text-xs text-subtle">
              Excludes {plural(version.unpricedItemCount, "item")} with price on request
            </dd>
          ) : null}
        </div>
      </dl>

      {version.plan.summary ? <p className="text-fg-soft">{version.plan.summary}</p> : null}

      <ol className="flex flex-col gap-4">
        {version.days.map((day) => (
          <li
            key={day.dayNumber}
            data-testid="itinerary-day"
            className="rounded-2xl border border-line bg-surface p-5"
          >
            <h2 className="text-lg font-semibold">
              Day {day.dayNumber} · {formatDate(day.date)}
            </h2>
            {day.transport ? (
              <ListingLine
                label="Transport"
                item={day.transport}
                unitOne="vehicle"
                priceUnit="per vehicle"
                testId="itinerary-transport"
              />
            ) : null}
            {day.items.length === 0 ? (
              <p className="text-sm text-muted">
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
                          <Link
                            href={`/experiences/${item.experienceSlug}`}
                            className="font-medium text-accent underline-offset-4 hover:underline"
                          >
                            {item.title}
                          </Link>
                        ) : (
                          <>
                            {item.title}{" "}
                            <span className="text-sm text-danger">(no longer available)</span>
                          </>
                        )}
                      </p>
                      <p className="text-sm text-muted">
                        {item.destinationName} · {formatDuration(item.durationMinutes)} ·{" "}
                        {price ? `from ${price} per person` : "price on request"}
                      </p>
                      {item.rationale ? (
                        <p className="text-sm text-fg-soft">{item.rationale}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            {day.stay ? (
              <div className="mt-3">
                <ListingLine
                  label="Stay tonight"
                  item={day.stay}
                  unitOne="room"
                  priceUnit="per room per night"
                  testId="itinerary-stay"
                />
              </div>
            ) : null}
            {day.note ? <p className="mt-2 text-sm text-muted">{day.note}</p> : null}
          </li>
        ))}
      </ol>

      {version.plan.cautions.length > 0 || version.warnings.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Things to check</h2>
          <ul className="list-disc pl-5 text-sm text-fg-soft">
            {[...version.warnings, ...version.plan.cautions].map((text, i) => (
              <li key={i}>{text}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
