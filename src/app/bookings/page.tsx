import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { LoadingBlock, PageShell } from "@/components/page-shell";
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
      <p className="text-zinc-600 dark:text-zinc-400">
        You haven&apos;t requested any bookings yet.{" "}
        <Link href="/experiences" className="underline">
          Find an experience
        </Link>
        .
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {bookings.map((b) => (
        <li
          key={b.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
        >
          <div>
            <Link href={`/bookings/${b.id}`} className="font-semibold underline">
              {b.experienceTitle}
            </Link>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
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
    <PageShell title="Your bookings">
      <Suspense fallback={<LoadingBlock label="Loading your bookings…" />}>
        <BookingList />
      </Suspense>
    </PageShell>
  );
}
