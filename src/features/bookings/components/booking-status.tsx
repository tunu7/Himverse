import { BOOKING_STATUS_LABELS, type BookingStatus, effectiveStatus } from "@/lib/booking-options";

const TONE: Record<BookingStatus, string> = {
  requested: "bg-warning-soft text-warning-soft-fg",
  confirmed: "bg-accent-soft text-accent-soft-fg",
  completed: "bg-surface-muted text-fg-soft",
  declined: "bg-danger-soft text-danger-soft-fg",
  cancelled: "bg-danger-soft text-danger-soft-fg",
  expired: "bg-surface-muted text-muted",
};

export function BookingStatusBadge({
  status,
  requestExpiresAt,
  now,
  priceProposed = false,
}: {
  status: BookingStatus;
  requestExpiresAt: string;
  now: Date;
  /** A partner's total waits for the traveller's approval. */
  priceProposed?: boolean;
}) {
  const shown = effectiveStatus(status, requestExpiresAt, now);
  const label =
    shown === "requested" && priceProposed
      ? "New price awaiting approval"
      : BOOKING_STATUS_LABELS[shown];
  return (
    <span
      data-testid="booking-status"
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[shown]}`}
    >
      {label}
    </span>
  );
}
