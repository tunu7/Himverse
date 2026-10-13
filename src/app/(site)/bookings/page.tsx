import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { buttonClass } from "@/components/form-feedback";
import { LoadingBlock, PageShell } from "@/components/page-shell";
import { EmptyState } from "@/components/ui";
import { BookingStatusBadge } from "@/features/bookings/components/booking-status";
import { formatSlot } from "@/lib/format";
import { requireUserForPage } from "@/server/auth/session";
import { listMyBookings } from "@/server/bookings/repository";

async function BookingList() {
  await requireUserForPage("/bookings");
  await connection();
  const now = new Date();
  const bookings = await listMyBookings();
  if (bookings.length === 0) {
    return (
      <EmptyState title="You haven't requested any bookings yet.">
        <p>Find an experience you like, pick a date and send the provider a request.</p>
        <Link href="/experiences" className={`${buttonClass} mt-3`}>
          Find an experience
        </Link>
      </EmptyState>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {bookings.map((b) => (
        <li
          key={b.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface shadow-xs p-5"
        >
          <div>
            <Link
              href={`/bookings/${b.id}`}
              className="font-semibold text-fg underline-offset-4 hover:text-accent hover:underline"
            >
              {b.experienceTitle}
            </Link>
            <p className="text-sm text-muted">
              {formatSlot(b.slotStartsOn, b.slotStartTime)} · {b.partySize}{" "}
              {b.partySize === 1 ? "person" : "people"} · {b.reference}
            </p>
          </div>
          <BookingStatusBadge status={b.status} requestExpiresAt={b.requestExpiresAt} now={now} />
        </li>
      ))}
    </ul>
  );
}

export default function BookingsPage() {
  return (
    <PageShell title="Your bookings" width="narrow">
      <Suspense fallback={<LoadingBlock label="Loading your bookings…" variant="list" />}>
        <BookingList />
      </Suspense>
    </PageShell>
  );
}
