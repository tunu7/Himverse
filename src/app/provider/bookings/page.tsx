import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { LoadingBlock, PageShell } from "@/components/page-shell";
import { BookingStatusBadge } from "@/features/bookings/components/booking-status";
import { effectiveStatus, type BookingStatus } from "@/lib/booking-options";
import { formatSlot } from "@/lib/format";
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
        <p className="text-sm text-muted">None.</p>
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
                  {formatSlot(b.slotStartsOn, b.slotStartTime)} · {b.travelerName} · {b.partySize}{" "}
                  {b.partySize === 1 ? "person" : "people"} · {b.reference}
                </p>
              </div>
              <BookingStatusBadge
                status={b.status}
                requestExpiresAt={b.requestExpiresAt}
                now={now}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

async function ProviderBookings() {
  await requireAccountForPage("/provider/bookings", ["partner"]);
  await connection();
  const now = new Date();
  const bookings = await listProviderBookings();
  const by = (...statuses: BookingStatus[]) =>
    bookings.filter((b) => statuses.includes(effectiveStatus(b.status, b.requestExpiresAt, now)));
  return (
    <div className="flex flex-col gap-8">
      <Group title="Awaiting your response" bookings={by("requested")} now={now} />
      <Group title="Confirmed" bookings={by("confirmed")} now={now} />
      <Group
        title="Past and closed"
        bookings={by("completed", "declined", "cancelled", "expired")}
        now={now}
      />
    </div>
  );
}

export default function ProviderBookingsPage() {
  return (
    <PageShell
      title="Booking requests"
      description="Confirm or decline requests within 48 hours. Travellers see your reply and the final price."
    >
      <Suspense fallback={<LoadingBlock label="Loading bookings…" variant="list" />}>
        <ProviderBookings />
      </Suspense>
    </PageShell>
  );
}
