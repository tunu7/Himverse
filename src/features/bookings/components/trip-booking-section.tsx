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
export async function TripBookingSection({ version }: { version: ItineraryView["version"] }) {
  await connection();
  const items = version.days.flatMap((day) =>
    day.items
      .filter((item) => item.experienceId !== null)
      .map((item) => ({ id: item.id, title: item.title, date: day.date })),
  );
  const firstDate = items[0]?.date;

  return (
    <section
      className="flex flex-col gap-4 rounded-3xl border border-line bg-surface p-5 sm:p-7"
      aria-labelledby="book-trip-heading"
    >
      <h2 id="book-trip-heading" className="text-xl font-semibold tracking-tight">
        Book this trip
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted">This plan has no experiences to book.</p>
      ) : firstDate === undefined || firstDate <= istDate(new Date()) ? (
        <p className="text-sm text-muted">
          This trip&apos;s dates have started or passed. Plan a new trip to book it.
        </p>
      ) : (
        <TripBookingForm
          versionId={version.id}
          // One key per rendered form; resubmitting reuses it (each item replays).
          idempotencyKey={crypto.randomUUID()}
          items={items.map((i) => ({ id: i.id, title: i.title, dateLabel: dateLabel(i.date) }))}
        />
      )}
    </section>
  );
}
