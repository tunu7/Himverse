import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { FilterTabs } from "@/components/dashboard";
import { LoadingBlock, PageShell } from "@/components/page-shell";
import { BookingStatusBadge } from "@/features/bookings/components/booking-status";
import { effectiveStatus, type BookingStatus } from "@/lib/booking-options";
import { formatBookingDates } from "@/lib/format";
import { unitCount } from "@/lib/listing-options";
import { requireAccountForPage } from "@/server/auth/session";
import { listProviderBookings, type ProviderBooking } from "@/server/bookings/repository";

function Group({
  title,
  bookings,
  now,
}: {
  title: string;
  bookings: ProviderBooking[];
  now: Date;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">
        {title} ({bookings.length})
      </h2>
      {bookings.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-6 text-sm text-muted">
          Nothing here right now.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {bookings.map((b) => (
            <li
              key={b.id}
              data-testid="provider-booking"
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4"
            >
              <div>
                <Link
                  href={`/provider/bookings/${b.id}`}
                  className="font-medium text-fg underline-offset-4 hover:text-accent hover:underline"
                >
                  {b.experienceTitle}
                </Link>
                <p className="text-sm text-muted">
                  {formatBookingDates(b.slotStartsOn, b.slotStartTime, b.endsOn, b.listingType)} ·{" "}
                  {b.travelerName} · {b.partySize} {b.partySize === 1 ? "person" : "people"}
                  {b.listingType && b.listingType !== "experience"
                    ? ` · ${unitCount(b.listingType, b.units)}`
                    : ""}{" "}
                  · {b.reference}
                </p>
              </div>
              <BookingStatusBadge
                status={b.status}
                requestExpiresAt={b.requestExpiresAt}
                now={now}
                priceProposed={b.proposedTotalMinor !== null}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const VIEWS = {
  "needs-response": { label: "Needs response", title: "Awaiting your response" },
  "price-sent": { label: "Price sent", title: "Waiting for the traveller to accept your price" },
  upcoming: { label: "Upcoming", title: "Confirmed and upcoming" },
  past: { label: "Past and closed", title: "Past and closed" },
  all: { label: "All", title: "All requests" },
} as const;
type View = keyof typeof VIEWS;

async function ProviderBookings({ searchParams }: PageProps<"/provider/bookings">) {
  await requireAccountForPage("/provider/bookings", ["partner"]);
  await connection();
  const raw = (await searchParams).view;
  const view: View = typeof raw === "string" && raw in VIEWS ? (raw as View) : "needs-response";
  const now = new Date();
  const bookings = await listProviderBookings();
  const by = (...statuses: BookingStatus[]) =>
    bookings.filter((b) => statuses.includes(effectiveStatus(b.status, b.requestExpiresAt, now)));
  const groups: Record<View, ProviderBooking[]> = {
    "needs-response": by("requested").filter((b) => b.proposedTotalMinor === null),
    "price-sent": by("requested").filter((b) => b.proposedTotalMinor !== null),
    upcoming: by("confirmed"),
    past: by("completed", "declined", "cancelled", "expired"),
    all: bookings,
  };
  return (
    <div className="flex flex-col gap-6">
      <FilterTabs
        label="Booking views"
        active={view}
        hrefFor={(key) => `/provider/bookings?view=${key}`}
        tabs={(Object.keys(VIEWS) as View[]).map((key) => ({
          key,
          label: VIEWS[key].label,
          count: groups[key].length,
        }))}
      />
      <Group title={VIEWS[view].title} bookings={groups[view]} now={now} />
    </div>
  );
}

export default function ProviderBookingsPage(props: PageProps<"/provider/bookings">) {
  return (
    <PageShell
      title="Booking requests"
      description="Confirm or decline requests within 48 hours. Travellers see your reply and the final price."
    >
      <Suspense fallback={<LoadingBlock label="Loading bookings…" variant="list" />}>
        <ProviderBookings {...props} />
      </Suspense>
    </PageShell>
  );
}
