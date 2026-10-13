/**
 * Booking rules shared by server code and client components (ADR-0004). The
 * authoritative enforcement is in the database functions; these mirror them for
 * display. Provisional business rules: see docs/product/BOOKING_POLICY.md.
 */
import type { Database } from "@/types/database";

export type BookingStatus = Database["public"]["Enums"]["booking_status"];

export const REQUEST_RESPONSE_HOURS = 48;
export const TRAVELER_CANCEL_CUTOFF_HOURS = 24;
export const MAX_PARTY_SIZE = 20;
export const TRIP_TIME_ZONE_OFFSET = "+05:30"; // India Standard Time, no DST

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  requested: "Awaiting provider confirmation",
  confirmed: "Confirmed",
  declined: "Declined",
  cancelled: "Cancelled",
  expired: "Expired (no response in time)",
  completed: "Completed",
};

/** "YYYY-MM-DD" in India, `offsetDays` from `now` (IST has no DST, so fixed offset is exact). */
export function istDate(now: Date, offsetDays = 0): string {
  return new Date(now.getTime() + 330 * 60_000 + offsetDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** Slot start as an instant (dates are local to India). */
export function slotStartsAt(startsOn: string, startTime: string | null): Date {
  return new Date(`${startsOn}T${startTime ?? "00:00:00"}${TRIP_TIME_ZONE_OFFSET}`);
}

/**
 * Status to show right now. A request past its deadline is shown as expired even
 * before the scheduled sweep records it (the database refuses to confirm it).
 */
export function effectiveStatus(
  status: BookingStatus,
  requestExpiresAt: string,
  now: Date,
): BookingStatus {
  return status === "requested" && new Date(requestExpiresAt) <= now ? "expired" : status;
}

export function travelerCanCancel(
  status: BookingStatus,
  startsAt: Date,
  requestExpiresAt: string,
  now: Date,
): boolean {
  const current = effectiveStatus(status, requestExpiresAt, now);
  if (current === "requested") return true;
  if (current === "confirmed") {
    return startsAt.getTime() - now.getTime() >= TRAVELER_CANCEL_CUTOFF_HOURS * 3_600_000;
  }
  return false;
}
