import { BOOKING_STATUS_LABELS, type BookingStatus, effectiveStatus } from "@/lib/booking-options";

const TONE: Record<BookingStatus, string> = {
  requested: "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  confirmed: "bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  completed: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
  declined: "bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-200",
  cancelled: "bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-200",
  expired: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
};

export function BookingStatusBadge({
  status,
  requestExpiresAt,
  now,
}: {
  status: BookingStatus;
  requestExpiresAt: string;
  now: Date;
}) {
  const shown = effectiveStatus(status, requestExpiresAt, now);
  return (
    <span
      data-testid="booking-status"
      className={`rounded px-2 py-0.5 text-sm font-medium ${TONE[shown]}`}
    >
      {BOOKING_STATUS_LABELS[shown]}
    </span>
  );
}
