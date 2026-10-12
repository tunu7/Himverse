import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { LoadingBlock } from "@/components/page-shell";
import { CancelBookingForm, RespondForm } from "@/features/bookings/components/booking-forms";
import { BookingStatusBadge } from "@/features/bookings/components/booking-status";
import {
  BOOKING_STATUS_LABELS,
  effectiveStatus,
  slotStartsAt,
  travelerCanCancel,
} from "@/lib/booking-options";
import { formatPriceFrom, formatSlot } from "@/lib/format";
import { requireUserForPage } from "@/server/auth/session";
import { getBooking } from "@/server/bookings/repository";

async function BookingDetail({ params }: PageProps<"/bookings/[id]">) {
  const { id } = await params;
  await requireUserForPage(`/bookings/${id}`);
  await connection();
  // RLS: visible only to the traveler and the booking's provider members.
  const booking = await getBooking(id);
  if (!booking) {
    notFound();
  }
  const now = new Date();
  const status = effectiveStatus(booking.status, booking.requestExpiresAt, now);
  const startsAt = slotStartsAt(booking.slotStartsOn, booking.slotStartTime);
  const estimate = formatPriceFrom(booking.estimatedTotalMinor);
  const confirmed = formatPriceFrom(booking.confirmedTotalMinor);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <Link
            href={booking.isTraveler ? "/bookings" : "/provider/bookings"}
            className="underline"
          >
            {booking.isTraveler ? "Your bookings" : "Booking requests"}
          </Link>{" "}
          · {booking.reference}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">{booking.experienceTitle}</h1>
        <BookingStatusBadge
          status={booking.status}
          requestExpiresAt={booking.requestExpiresAt}
          now={now}
        />
      </header>

      <dl className="grid gap-4 rounded-lg border border-zinc-200 p-4 sm:grid-cols-2 dark:border-zinc-800">
        <div>
          <dt className="text-sm text-zinc-500">Date</dt>
          <dd className="font-medium">{formatSlot(booking.slotStartsOn, booking.slotStartTime)}</dd>
        </div>
        <div>
          <dt className="text-sm text-zinc-500">Party</dt>
          <dd className="font-medium">
            {booking.adults} {booking.adults === 1 ? "adult" : "adults"}
            {booking.children > 0
              ? `, ${booking.children} ${booking.children === 1 ? "child" : "children"}`
              : ""}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-zinc-500">Price</dt>
          <dd className="font-medium" data-testid="booking-price">
            {confirmed
              ? `${confirmed} (confirmed by the provider)`
              : estimate
                ? `Estimated from ${estimate}; the provider confirms the final price`
                : "Price on request"}
          </dd>
          {confirmed && estimate && confirmed !== estimate ? (
            <dd className="text-xs text-zinc-500">Original estimate: from {estimate}</dd>
          ) : null}
        </div>
        {!booking.isTraveler ? (
          <div>
            <dt className="text-sm text-zinc-500">Contact</dt>
            <dd className="font-medium">{booking.contactPhone}</dd>
          </div>
        ) : null}
        {status === "requested" ? (
          <div>
            <dt className="text-sm text-zinc-500">Respond by</dt>
            <dd className="font-medium">
              {new Date(booking.requestExpiresAt).toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata",
              })}
            </dd>
          </div>
        ) : null}
      </dl>

      {booking.travelerNote ? (
        <p className="text-sm">Traveller&apos;s message: {booking.travelerNote}</p>
      ) : null}
      {booking.providerNote ? (
        <p className="text-sm">Provider&apos;s message: {booking.providerNote}</p>
      ) : null}
      {booking.cancellationReason ? (
        <p className="text-sm">
          Cancelled by the {booking.cancelledBy}: {booking.cancellationReason}
        </p>
      ) : null}
      <p className="text-xs text-zinc-500">No payment is taken through Himverse.AI.</p>

      {booking.isTraveler &&
      travelerCanCancel(booking.status, startsAt, booking.requestExpiresAt, now) ? (
        <CancelBookingForm bookingId={booking.id} requireReason={false} />
      ) : null}
      {booking.isTraveler &&
      status === "confirmed" &&
      !travelerCanCancel(booking.status, startsAt, booking.requestExpiresAt, now) ? (
        <p className="text-sm text-zinc-600">
          Less than 24 hours to go: please contact the provider directly to cancel.
        </p>
      ) : null}
      {!booking.isTraveler && status === "requested" ? (
        <section className="flex flex-col gap-2" aria-label="Respond">
          <h2 className="text-lg font-semibold">Respond</h2>
          <RespondForm
            bookingId={booking.id}
            suggestedTotalRupees={
              booking.estimatedTotalMinor === null
                ? null
                : Math.round(booking.estimatedTotalMinor / 100)
            }
          />
        </section>
      ) : null}
      {!booking.isTraveler && status === "confirmed" ? (
        <CancelBookingForm bookingId={booking.id} requireReason />
      ) : null}

      <section className="flex flex-col gap-2" aria-labelledby="history-heading">
        <h2 id="history-heading" className="text-lg font-semibold">
          History
        </h2>
        <ol className="flex flex-col gap-1 text-sm" data-testid="booking-history">
          {booking.events.map((e, i) => (
            <li key={i}>
              {new Date(e.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}:{" "}
              {BOOKING_STATUS_LABELS[e.toStatus]} ({e.actor}){e.note ? `: ${e.note}` : ""}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

export default function BookingPage(props: PageProps<"/bookings/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <Suspense fallback={<LoadingBlock label="Loading booking…" />}>
        <BookingDetail {...props} />
      </Suspense>
    </main>
  );
}
