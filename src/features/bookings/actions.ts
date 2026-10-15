"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { type ActionResult, AppError, ok, toLoggedFailure } from "@/lib/errors";
import { istDate, MAX_BOOKING_DAYS_AHEAD } from "@/lib/booking-options";
import { parseInput } from "@/lib/validation";
import { requireAccount } from "@/server/auth/session";
import {
  cancelBooking,
  createSlot,
  requestBookingOnDate,
  requestItineraryBookings,
  respondToBooking,
  type TripBookingItemResult,
  updateSlot,
} from "@/server/bookings/repository";
import { todayInTripZone } from "@/server/itineraries/preferences";

import {
  addSlotSchema,
  cancelSchema,
  requestBookingSchema,
  respondSchema,
  slotStatusSchema,
  tripBookingSchema,
} from "./schemas";

// Inputs are validated here; the database functions re-check identity,
// ownership, eligibility, seats and transitions, and derive provider, price and
// status themselves. Nothing here trusts client-supplied prices or ownership.

export type BookingActionResult = ActionResult<{ done: true }> | null;

export async function requestBookingAction(
  _prev: BookingActionResult,
  formData: FormData,
): Promise<BookingActionResult> {
  let bookingId: string;
  try {
    const input = parseInput(requestBookingSchema, formData);
    await requireAccount(["traveller"]);
    // Clear message here; the database also refuses dates that have started.
    if (input.date <= todayInTripZone(new Date())) {
      throw new AppError("VALIDATION_FAILED", "Please check the highlighted fields.", {
        fieldErrors: { date: ["Choose a date from tomorrow onwards."] },
      });
    }
    if (input.date > istDate(new Date(), MAX_BOOKING_DAYS_AHEAD)) {
      throw new AppError("VALIDATION_FAILED", "Please check the highlighted fields.", {
        fieldErrors: { date: ["Choose a date within the next two years."] },
      });
    }
    ({ bookingId } = await requestBookingOnDate(input));
  } catch (error) {
    return toLoggedFailure("bookings.request_failed", error);
  }
  redirect(`/bookings/${bookingId}`);
}

export type TripBookingActionResult = ActionResult<{ items: TripBookingItemResult[] }> | null;

/** Requests every item of an itinerary version; each item succeeds or fails on its own. */
export async function bookTripAction(
  _prev: TripBookingActionResult,
  formData: FormData,
): Promise<TripBookingActionResult> {
  try {
    const input = parseInput(tripBookingSchema, formData);
    await requireAccount(["traveller"]);
    const items = await requestItineraryBookings(input);
    if (items.some((i) => i.booking && !i.alreadyRequested)) refresh();
    return ok({ items });
  } catch (error) {
    return toLoggedFailure("bookings.trip_request_failed", error);
  }
}

export async function respondToBookingAction(
  _prev: BookingActionResult,
  formData: FormData,
): Promise<BookingActionResult> {
  try {
    const input = parseInput(respondSchema, formData);
    await requireAccount(["partner"]);
    await respondToBooking(
      input.bookingId,
      input.decision,
      typeof input.finalTotalRupees === "number" ? input.finalTotalRupees * 100 : null,
      input.note,
    );
    refresh();
    return ok({ done: true });
  } catch (error) {
    return toLoggedFailure("bookings.respond_failed", error);
  }
}

export async function cancelBookingAction(
  _prev: BookingActionResult,
  formData: FormData,
): Promise<BookingActionResult> {
  try {
    const input = parseInput(cancelSchema, formData);
    await requireAccount(["traveller", "partner"]);
    await cancelBooking(input.bookingId, input.reason);
    refresh();
    return ok({ done: true });
  } catch (error) {
    return toLoggedFailure("bookings.cancel_failed", error);
  }
}

export async function addSlotAction(
  _prev: BookingActionResult,
  formData: FormData,
): Promise<BookingActionResult> {
  try {
    const input = parseInput(addSlotSchema, formData);
    await requireAccount(["partner"]);
    // Clear message here; RLS also refuses past dates.
    if (input.startsOn < todayInTripZone(new Date())) {
      throw new AppError("VALIDATION_FAILED", "Please check the highlighted fields.", {
        fieldErrors: { startsOn: ["Choose today or a future date."] },
      });
    }
    await createSlot({
      experienceId: input.experienceId,
      startsOn: input.startsOn,
      startTime: input.startTime || null,
      capacity: input.capacity,
    });
    refresh();
    return ok({ done: true });
  } catch (error) {
    return toLoggedFailure("bookings.add_slot_failed", error);
  }
}

export async function setSlotStatusAction(
  _prev: BookingActionResult,
  formData: FormData,
): Promise<BookingActionResult> {
  try {
    const input = parseInput(slotStatusSchema, formData);
    await requireAccount(["partner"]);
    await updateSlot(input.slotId, { status: input.status });
    refresh();
    return ok({ done: true });
  } catch (error) {
    return toLoggedFailure("bookings.slot_status_failed", error);
  }
}
