import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import {
  BOOKING_STATUS_LABELS,
  effectiveStatus,
  slotStartsAt,
  travelerCanCancel,
} from "@/lib/booking-options";
import { formatPriceFrom, formatBookingDates } from "@/lib/format";
import { type ListingType, unitCount } from "@/lib/listing-options";
import { getBooking } from "@/server/bookings/repository";

import { AcceptPriceForm, CancelBookingForm, RespondForm } from "./booking-forms";
import { BookingStatusBadge } from "./booking-status";
import { DepositPanel } from "./deposit-panel";

/**
 * A booking as seen from one area: the traveller's own booking, or a request
 * to the partner's business. Each area shows only its side (ADR-0007), so a
 * booking that isn't the viewer's in that role is "not found" there.
 */
/** " · 2 rooms" for listings booked by the unit; nothing for experiences. */
function unitsText(listingType: ListingType, units: number): string {
  if (listingType !== "experience") return ` · ${unitCount(listingType, units)}`;
  return units > 1 ? ` · quantity ${units}` : "";
}

export async function BookingDetail({
  id,
  viewer,
}: {
  id: string;
  viewer: "traveller" | "partner";
}) {
  await connection();
  // RLS: visible only to the traveler and the booking's provider members.
  const booking = await getBooking(id);
  if (!booking || booking.isTraveler !== (viewer === "traveller")) {
    notFound();
  }
  const now = new Date();
  const status = effectiveStatus(booking.status, booking.requestExpiresAt, now);
  const startsAt = slotStartsAt(booking.slotStartsOn, booking.slotStartTime);
  const estimate = formatPriceFrom(booking.estimatedTotalMinor);
  const confirmed = formatPriceFrom(booking.confirmedTotalMinor);
  // A partner's total above the threshold, waiting for the traveller (ADR-0004 amendment).
  const proposedMinor = status === "requested" ? booking.proposedTotalMinor : null;
  const deadline = new Date(booking.requestExpiresAt).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted">
          <Link
            href={booking.isTraveler ? "/bookings" : "/provider/bookings"}
            className="font-medium text-accent underline-offset-4 hover:underline"
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
          priceProposed={proposedMinor !== null}
        />
      </header>

      <dl className="grid gap-4 rounded-2xl border border-line bg-surface p-5 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium tracking-wide text-subtle uppercase">Date</dt>
          <dd className="font-medium">
            {formatBookingDates(
              booking.slotStartsOn,
              booking.slotStartTime,
              booking.endsOn,
              booking.listingType,
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium tracking-wide text-subtle uppercase">Party</dt>
          <dd className="font-medium">
            {booking.adults} {booking.adults === 1 ? "adult" : "adults"}
            {booking.children > 0
              ? `, ${booking.children} ${booking.children === 1 ? "child" : "children"}`
              : ""}
            {unitsText(booking.listingType, booking.units)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium tracking-wide text-subtle uppercase">Price</dt>
          <dd className="font-medium" data-testid="booking-price">
            {confirmed
              ? `${confirmed} (confirmed by the provider)`
              : estimate
                ? `Estimated from ${estimate}; the provider confirms the final price`
                : "Price on request"}
          </dd>
          {confirmed && estimate && confirmed !== estimate ? (
            <dd className="text-xs text-subtle">Original estimate: from {estimate}</dd>
          ) : null}
        </div>
        {!booking.isTraveler ? (
          <div>
            <dt className="text-xs font-medium tracking-wide text-subtle uppercase">Contact</dt>
            <dd className="font-medium">
              {booking.contactPhone || "Not available (the traveller deleted their account)"}
            </dd>
          </div>
        ) : null}
        {status === "requested" ? (
          <div>
            <dt className="text-xs font-medium tracking-wide text-subtle uppercase">
              {proposedMinor !== null ? "Price open until" : "Respond by"}
            </dt>
            <dd className="font-medium">{deadline}</dd>
          </div>
        ) : null}
      </dl>

      {booking.pickupNote ? <p className="text-sm">Pickup: {booking.pickupNote}</p> : null}
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
      <DepositPanel booking={booking} now={now} />

      {booking.isTraveler && proposedMinor !== null ? (
        <section
          className="flex flex-col gap-3 rounded-2xl border border-warning/30 bg-warning-soft p-5"
          aria-labelledby="proposal-heading"
          data-testid="price-proposal"
        >
          <h2 id="proposal-heading" className="text-lg font-semibold text-warning-soft-fg">
            New price to approve
          </h2>
          <p className="text-sm text-warning-soft-fg">
            The provider can take this booking for <strong>{formatPriceFrom(proposedMinor)}</strong>{" "}
            in total
            {estimate ? ` (your estimate was from ${estimate})` : ""}. Nothing is confirmed until
            you accept, by {deadline}. To decline, cancel the request below.
          </p>
          <AcceptPriceForm bookingId={booking.id} totalMinor={proposedMinor} />
        </section>
      ) : null}
      {booking.isTraveler &&
      travelerCanCancel(booking.status, startsAt, booking.requestExpiresAt, now) ? (
        <CancelBookingForm bookingId={booking.id} requireReason={false} />
      ) : null}
      {booking.isTraveler &&
      status === "confirmed" &&
      !travelerCanCancel(booking.status, startsAt, booking.requestExpiresAt, now) ? (
        <p className="text-sm text-muted">
          Less than 24 hours to go: please contact the provider directly to cancel.
        </p>
      ) : null}
      {!booking.isTraveler && proposedMinor !== null ? (
        <section className="flex flex-col gap-2" aria-label="Proposed price">
          <p className="text-sm text-muted" data-testid="price-proposal">
            You proposed {formatPriceFrom(proposedMinor)}. Waiting for the traveller to accept by{" "}
            {deadline}; if they don&apos;t, the request expires. If the price was a mistake, decline
            with a message and the traveller can request again.
          </p>
          <RespondForm bookingId={booking.id} suggestedTotalRupees={null} declineOnly />
        </section>
      ) : null}
      {!booking.isTraveler && status === "requested" && proposedMinor === null ? (
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
