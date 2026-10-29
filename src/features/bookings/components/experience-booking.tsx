import Link from "next/link";
import { connection } from "next/server";

import { istDate, MAX_BOOKING_DAYS_AHEAD } from "@/lib/booking-options";
import { formatSlot } from "@/lib/format";
import { getCurrentAccount } from "@/server/auth/session";
import { listOpenSlots } from "@/server/bookings/repository";

import type { ListingType, PriceUnit } from "@/lib/listing-options";

import { BookingRequestForm } from "./booking-forms";
import { ListingBookingForm } from "./listing-booking-form";

/**
 * "Book now" for a listing page. Rendered at request time. Bookings are
 * confirmed instantly (ADR-0004 amendment 2026-10-29); experiences can be
 * booked only on dates the provider has published.
 */
export async function ExperienceBooking({
  experienceId,
  experienceSlug,
  priceFromMinor,
  acceptsBookings,
  listing,
}: {
  experienceId: string;
  experienceSlug: string;
  priceFromMinor: number | null;
  acceptsBookings: boolean;
  /** Type details; guides, stays and transport book a date range and a quantity. */
  listing: {
    type: ListingType;
    priceUnit: PriceUnit;
    dailyCapacity: number | null;
    maxGuests: number | null;
  };
}) {
  await connection();
  if (!acceptsBookings) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-line-strong p-5">
        <p className="text-sm text-muted">
          This provider isn&apos;t taking bookings for this listing right now.
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
  const [slots, account] = await Promise.all([listOpenSlots(experienceId), getCurrentAccount()]);

  if (account?.accountType === "partner" || account?.accountType === "admin") {
    // One role per account (ADR-0007): the database refuses these anyway.
    return (
      <p
        className="rounded-2xl bg-surface-muted p-4 text-sm text-fg-soft"
        data-testid="booking-not-for-account"
      >
        Booking is for traveller accounts. You&apos;re signed in with a {account.accountType}{" "}
        account; to travel, use a separate traveller account.
      </p>
    );
  }
  if (account && !account.accountType) {
    return (
      <p className="text-sm">
        <Link
          href={`/welcome?next=${encodeURIComponent(`/experiences/${experienceSlug}`)}`}
          className="font-medium text-accent underline-offset-4 hover:underline"
        >
          Finish setting up your account
        </Link>{" "}
        to book.
      </p>
    );
  }
  if (!account) {
    return (
      <p className="text-sm">
        <Link
          href={`/sign-in?next=${encodeURIComponent(`/experiences/${experienceSlug}`)}`}
          className="font-medium text-accent underline-offset-4 hover:underline"
        >
          Sign in
        </Link>{" "}
        to book
        {listing.type === "experience"
          ? slots.length > 0
            ? ` (${slots.length} ${slots.length === 1 ? "date" : "dates"} open)`
            : " once the provider publishes dates"
          : ""}
        .
      </p>
    );
  }
  if (listing.type !== "experience" && listing.dailyCapacity && listing.maxGuests) {
    return (
      <ListingBookingForm
        // One key per rendered form; resubmitting this form reuses it.
        idempotencyKey={crypto.randomUUID()}
        experienceId={experienceId}
        listingType={listing.type}
        priceUnit={listing.priceUnit}
        priceFromMinor={priceFromMinor}
        dailyCapacity={listing.dailyCapacity}
        maxGuests={listing.maxGuests}
        minDate={istDate(new Date(), 1)}
        maxDate={istDate(new Date(), MAX_BOOKING_DAYS_AHEAD)}
      />
    );
  }
  if (slots.length === 0) {
    return (
      <p className="rounded-2xl bg-surface-muted p-4 text-sm text-fg-soft" data-testid="no-dates">
        No dates are open for booking yet. Check back soon.
      </p>
    );
  }
  return (
    <BookingRequestForm
      // One key per rendered form; resubmitting this form reuses it.
      idempotencyKey={crypto.randomUUID()}
      experienceId={experienceId}
      priceFromMinor={priceFromMinor}
      slots={slots.map((s) => ({
        id: s.id,
        date: s.startsOn,
        label: formatSlot(s.startsOn, s.startTime),
        seatsLeft: s.seatsLeft,
      }))}
    />
  );
}
