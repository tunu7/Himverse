import Link from "next/link";
import { connection } from "next/server";

import { istDate, MAX_BOOKING_DAYS_AHEAD } from "@/lib/booking-options";
import { formatSlot } from "@/lib/format";
import { getCurrentUser } from "@/server/auth/session";
import { listOpenSlots } from "@/server/bookings/repository";

import { BookingRequestForm } from "./booking-forms";

/**
 * "Request to book" for an experience page. Rendered at request time. Any
 * future date can be requested when the provider accepts bookings; published
 * dates are shown as hints (ADR-0004).
 */
export async function ExperienceBooking({
  experienceId,
  experienceSlug,
  priceFromMinor,
  acceptsBookings,
}: {
  experienceId: string;
  experienceSlug: string;
  priceFromMinor: number | null;
  acceptsBookings: boolean;
}) {
  await connection();
  if (!acceptsBookings) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-line-strong p-5">
        <p className="text-sm text-muted">
          This provider isn&apos;t taking booking requests for this experience right now.
        </p>
        <Link
          href="/experiences"
          className="self-start text-sm font-semibold text-accent hover:underline"
        >
          Browse other experiences →
        </Link>
      </div>
    );
  }
  const [slots, user] = await Promise.all([listOpenSlots(experienceId), getCurrentUser()]);

  if (!user) {
    return (
      <p className="text-sm">
        <Link
          href={`/sign-in?next=${encodeURIComponent(`/experiences/${experienceSlug}`)}`}
          className="font-medium text-accent underline-offset-4 hover:underline"
        >
          Sign in
        </Link>{" "}
        to request a booking
        {slots.length > 0
          ? ` (${slots.length} ${slots.length === 1 ? "date" : "dates"} open)`
          : " for any date"}
        .
      </p>
    );
  }
  return (
    <BookingRequestForm
      // One key per rendered form; resubmitting this form reuses it.
      idempotencyKey={crypto.randomUUID()}
      experienceId={experienceId}
      minDate={istDate(new Date(), 1)}
      maxDate={istDate(new Date(), MAX_BOOKING_DAYS_AHEAD)}
      priceFromMinor={priceFromMinor}
      slots={slots.map((s) => ({
        id: s.id,
        label: formatSlot(s.startsOn, s.startTime),
        seatsLeft: s.seatsLeft,
      }))}
    />
  );
}
