import Link from "next/link";
import { connection } from "next/server";

import { formatSlot } from "@/lib/format";
import { getCurrentUser } from "@/server/auth/session";
import { listOpenSlots } from "@/server/bookings/repository";

import { BookingRequestForm } from "./booking-forms";

/** "Request to book" for an experience page. Rendered at request time. */
export async function ExperienceBooking({
  experienceId,
  experienceSlug,
  priceFromMinor,
}: {
  experienceId: string;
  experienceSlug: string;
  priceFromMinor: number | null;
}) {
  await connection();
  const [slots, user] = await Promise.all([listOpenSlots(experienceId), getCurrentUser()]);

  if (slots.length === 0) {
    return <p className="text-sm text-muted">No dates are open for booking yet.</p>;
  }
  if (!user) {
    return (
      <p className="text-sm">
        <Link
          href={`/sign-in?next=${encodeURIComponent(`/experiences/${experienceSlug}`)}`}
          className="font-medium text-accent underline-offset-4 hover:underline"
        >
          Sign in
        </Link>{" "}
        to request a booking ({slots.length} {slots.length === 1 ? "date" : "dates"} open).
      </p>
    );
  }
  return (
    <BookingRequestForm
      // One key per rendered form; resubmitting this form reuses it.
      idempotencyKey={crypto.randomUUID()}
      priceFromMinor={priceFromMinor}
      slots={slots.map((s) => ({
        id: s.id,
        label: formatSlot(s.startsOn, s.startTime),
        seatsLeft: s.seatsLeft,
      }))}
    />
  );
}
