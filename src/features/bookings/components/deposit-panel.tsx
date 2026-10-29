import { formatPriceFrom } from "@/lib/format";
import type { BookingDetail } from "@/server/bookings/repository";

import { PayDeposit } from "./pay-deposit";

function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

const REFUND_STATUS = {
  pending: "being processed (usually 5–7 working days to reach you)",
  processed: "sent",
  failed: "delayed — Himverse will sort this out with you",
} as const;

/**
 * The online deposit for a booking (ADR-0005), from the database's state only:
 * what is due, whether Razorpay has confirmed it, and any refund.
 */
export function DepositPanel({ booking, now }: { booking: BookingDetail; now: Date }) {
  const { deposit, refund } = booking;
  if (!deposit) {
    return (
      <p className="text-xs text-subtle">
        No payment is taken through Himverse.AI for this booking.
      </p>
    );
  }
  const amount = formatPriceFrom(deposit.amountMinor);
  const balanceMinor =
    booking.confirmedTotalMinor !== null ? booking.confirmedTotalMinor - deposit.amountMinor : null;
  const balance = balanceMinor !== null ? formatPriceFrom(balanceMinor) : null;
  const awaiting =
    booking.status === "confirmed" && !deposit.paidAt && new Date(deposit.dueAt) > now;

  return (
    <section
      aria-labelledby="deposit-heading"
      className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5"
      data-testid="deposit-panel"
    >
      <h2 id="deposit-heading" className="text-lg font-semibold">
        Deposit
      </h2>
      {deposit.paidAt ? (
        <p data-testid="deposit-status">
          <span className="font-medium text-accent">{amount} deposit paid online</span> on{" "}
          {dateTime(deposit.paidAt)}.{" "}
          {balance
            ? booking.isTraveler
              ? `Pay the remaining ${balance} to the partner on the day.`
              : `Collected by Himverse for you; the traveller pays the remaining ${balance} to you on the day.`
            : null}
        </p>
      ) : awaiting ? (
        booking.isTraveler ? (
          <>
            <p className="text-sm text-fg-soft">
              Your booking is confirmed. Pay the 50% deposit of {amount} to keep it; unpaid bookings
              are cancelled automatically.
            </p>
            <PayDeposit
              bookingId={booking.id}
              amountMinor={deposit.amountMinor}
              dueLabel={dateTime(deposit.dueAt)}
            />
          </>
        ) : (
          <p className="text-sm text-fg-soft" data-testid="deposit-status">
            Waiting for the traveller&apos;s {amount} deposit, due by {dateTime(deposit.dueAt)}.
            Unpaid bookings are cancelled automatically and the date is freed.
          </p>
        )
      ) : (
        <p className="text-sm text-muted" data-testid="deposit-status">
          A {amount} deposit was due by {dateTime(deposit.dueAt)}; it wasn&apos;t paid.
        </p>
      )}
      {refund ? (
        <p className="text-sm" data-testid="refund-status">
          Refund of {formatPriceFrom(refund.amountMinor)}: {REFUND_STATUS[refund.status]}.
        </p>
      ) : null}
    </section>
  );
}
