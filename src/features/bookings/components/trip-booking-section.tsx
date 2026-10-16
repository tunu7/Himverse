import { connection } from "next/server";

import { istDate } from "@/lib/booking-options";
import type { ItineraryView } from "@/server/itineraries/repository";

import { TripBookingForm } from "./trip-booking";

function dateLabel(isoDate: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

/** "Book whole trip" for an itinerary version. Rendered at request time. */
type Line = {
  ids: string[];
  title: string;
  kind: "activity" | "stay" | "transport" | "guide";
  units: number;
  experienceId: string;
  from: string;
  to: string;
};

/**
 * One line per request the database will send: consecutive nights at the same
 * stay and room count, and consecutive days with the same guide and number of
 * guides, become one booking (as in `request_itinerary_bookings`).
 */
function tripLines(version: ItineraryView["version"]): Line[] {
  const lines: Line[] = [];
  for (const day of version.days) {
    const line = (
      item: ItineraryView["version"]["days"][number]["items"][number],
      kind: Line["kind"],
    ): Line | null =>
      item.experienceId === null
        ? null
        : {
            ids: [item.id],
            title: item.title,
            kind,
            units: item.units,
            experienceId: item.experienceId,
            from: day.date,
            to: day.date,
          };
    const transport = day.transport ? line(day.transport, "transport") : null;
    if (transport) lines.push(transport);
    for (const item of day.items) {
      const activity = line(item, "activity");
      if (activity) lines.push(activity);
    }
    for (const [item, kind] of [
      [day.guide, "guide"],
      [day.stay, "stay"],
    ] as const) {
      const next = item ? line(item, kind) : null;
      if (!next) continue;
      const previous = lines.findLast((l) => l.kind === kind);
      if (
        previous &&
        previous.experienceId === next.experienceId &&
        previous.units === next.units &&
        previous.to === addDays(next.from, -1)
      ) {
        previous.ids.push(...next.ids);
        previous.to = next.from;
      } else {
        lines.push(next);
      }
    }
  }
  return lines;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function lineLabel(line: Line): string {
  if (line.kind === "stay") {
    const nights = line.ids.length;
    return `${dateLabel(line.from)} – ${dateLabel(addDays(line.to, 1))} · ${nights} ${nights === 1 ? "night" : "nights"}, ${line.units} ${line.units === 1 ? "room" : "rooms"}`;
  }
  if (line.kind === "guide") {
    const days = line.ids.length;
    const range =
      days === 1 ? dateLabel(line.from) : `${dateLabel(line.from)} – ${dateLabel(line.to)}`;
    return `${range} · ${days} ${days === 1 ? "day" : "days"}, ${line.units} ${line.units === 1 ? "guide" : "guides"}`;
  }
  if (line.kind === "transport") {
    return `${dateLabel(line.from)} · ${line.units} ${line.units === 1 ? "vehicle" : "vehicles"}`;
  }
  return dateLabel(line.from);
}

/** "Book whole trip" for an itinerary version. Rendered at request time. */
export async function TripBookingSection({ version }: { version: ItineraryView["version"] }) {
  await connection();
  const items = tripLines(version);
  const firstDate = version.days[0]?.date;

  return (
    <section
      className="flex flex-col gap-4 rounded-3xl border border-line bg-surface p-5 sm:p-7"
      aria-labelledby="book-trip-heading"
    >
      <h2 id="book-trip-heading" className="text-xl font-semibold tracking-tight">
        Book this trip
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted">This plan has nothing to book.</p>
      ) : firstDate === undefined || firstDate <= istDate(new Date()) ? (
        <p className="text-sm text-muted">
          This trip&apos;s dates have started or passed. Plan a new trip to book it.
        </p>
      ) : (
        <TripBookingForm
          versionId={version.id}
          // One key per rendered form; resubmitting reuses it (each item replays).
          idempotencyKey={crypto.randomUUID()}
          items={items.map((i) => ({ ids: i.ids, title: i.title, dateLabel: lineLabel(i) }))}
        />
      )}
    </section>
  );
}
