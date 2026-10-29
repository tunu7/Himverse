"use client";

import { useActionState } from "react";

import {
  buttonClass,
  FieldError,
  fieldErrorsOf,
  FormAlert,
  inputClass,
  secondaryButtonClass,
} from "@/components/form-feedback";
import { MAX_PARTY_SIZE } from "@/lib/booking-options";
import { formatPriceFrom } from "@/lib/format";

import {
  acceptBookingPriceAction,
  addSlotAction,
  cancelBookingAction,
  requestBookingAction,
  respondToBookingAction,
  setSlotStatusAction,
} from "../actions";
import { PendingLabel } from "@/components/ui";

export type SlotOption = { id: string; date: string; label: string; seatsLeft: number };

/** Instant booking for an experience: only the dates the partner has published. */
export function BookingRequestForm({
  experienceId,
  slots,
  idempotencyKey,
  priceFromMinor,
}: {
  experienceId: string;
  /** Open published dates; at least one. Full dates are listed but can't be chosen. */
  slots: readonly SlotOption[];
  idempotencyKey: string;
  priceFromMinor: number | null;
}) {
  const [state, action, pending] = useActionState(requestBookingAction, null);
  const errors = (field: string) => fieldErrorsOf(state, field);
  const price = formatPriceFrom(priceFromMinor);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {/* Same key on retries and double clicks: the server returns the same booking. */}
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="experienceId" value={experienceId} />
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Date</span>
        <select
          name="date"
          required
          defaultValue=""
          className={inputClass}
          data-testid="published-dates"
        >
          <option value="" disabled>
            Choose a date
          </option>
          {slots.map((s) => (
            <option key={s.id} value={s.date} disabled={s.seatsLeft === 0}>
              {s.label} · {s.seatsLeft === 0 ? "full" : `${s.seatsLeft} seats left`}
            </option>
          ))}
        </select>
        <FieldError errors={errors("date")} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Adults</span>
          <input
            type="number"
            name="adults"
            min={1}
            max={MAX_PARTY_SIZE}
            defaultValue={2}
            className={inputClass}
          />
          <FieldError errors={errors("adults")} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Children</span>
          <input
            type="number"
            name="children"
            min={0}
            max={MAX_PARTY_SIZE - 1}
            defaultValue={0}
            className={inputClass}
          />
          <FieldError errors={errors("children")} />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">
          Contact phone (shared with the provider for this booking)
        </span>
        <input
          type="tel"
          name="contactPhone"
          autoComplete="tel"
          maxLength={20}
          className={inputClass}
        />
        <FieldError errors={errors("contactPhone")} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Message to the provider (optional)</span>
        <textarea name="note" rows={2} maxLength={500} className={inputClass} />
      </label>
      <p className="text-sm text-muted">
        {price
          ? `${price} per person. Your booking is confirmed straight away at this price. If a deposit is required, you pay 50% online within 1 hour or the booking is cancelled.`
          : "Price on request: the provider sets the price and confirms your booking."}
      </p>
      <FormAlert state={state} />
      <button type="submit" disabled={pending} className={`${buttonClass} self-start`}>
        <PendingLabel
          pending={pending}
          busy="Booking…"
          idle={price ? "Book now" : "Request booking"}
        />
      </button>
    </form>
  );
}

export function RespondForm({
  bookingId,
  suggestedTotalRupees,
  declineOnly = false,
}: {
  bookingId: string;
  suggestedTotalRupees: number | null;
  /** While a proposed price waits for the traveller, the partner can only decline. */
  declineOnly?: boolean;
}) {
  const [state, action, pending] = useActionState(respondToBookingAction, null);
  const errors = (field: string) => fieldErrorsOf(state, field);
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="bookingId" value={bookingId} />
      {declineOnly ? null : (
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Final price for the whole booking (₹)</span>
          <input
            type="number"
            name="finalTotalRupees"
            min={0}
            defaultValue={suggestedTotalRupees ?? ""}
            className={inputClass}
          />
          <FieldError errors={errors("finalTotalRupees")} />
        </label>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Message to the traveller (required to decline)</span>
        <textarea name="note" rows={2} maxLength={500} className={inputClass} />
        <FieldError errors={errors("note")} />
      </label>
      {declineOnly ? null : (
        <p className="text-xs text-muted">
          More than 10% above the estimate (or with no estimate) goes to the traveller to accept
          first.
        </p>
      )}
      <FormAlert state={state} />
      <div className="flex flex-wrap gap-3">
        {declineOnly ? null : (
          <button
            type="submit"
            name="decision"
            value="confirmed"
            disabled={pending}
            className={buttonClass}
          >
            Confirm booking
          </button>
        )}
        <button
          type="submit"
          name="decision"
          value="declined"
          disabled={pending}
          className={secondaryButtonClass}
        >
          Decline
        </button>
      </div>
    </form>
  );
}

/** Traveller accepts a partner's proposed total; declining is cancelling the request. */
export function AcceptPriceForm({
  bookingId,
  totalMinor,
}: {
  bookingId: string;
  totalMinor: number;
}) {
  const [state, action, pending] = useActionState(acceptBookingPriceAction, null);
  return (
    <form action={action} className="flex flex-col gap-2" noValidate>
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="totalMinor" value={totalMinor} />
      <FormAlert state={state} successMessage="Price accepted. Your booking is confirmed." />
      <button type="submit" disabled={pending} className={`${buttonClass} self-start`}>
        <PendingLabel
          pending={pending}
          idle={`Accept ${formatPriceFrom(totalMinor)}`}
          busy="Accepting…"
        />
      </button>
    </form>
  );
}

export function CancelBookingForm({
  bookingId,
  requireReason,
}: {
  bookingId: string;
  requireReason: boolean;
}) {
  const [state, action, pending] = useActionState(cancelBookingAction, null);
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm("Cancel this booking?")) event.preventDefault();
      }}
      className="flex flex-col gap-2"
      noValidate
    >
      <input type="hidden" name="bookingId" value={bookingId} />
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Reason{requireReason ? "" : " (optional)"}</span>
        <input name="reason" maxLength={500} className={inputClass} />
      </label>
      <FormAlert state={state} successMessage="Booking cancelled." />
      <button type="submit" disabled={pending} className={`${secondaryButtonClass} self-start`}>
        Cancel booking
      </button>
    </form>
  );
}

export function AddSlotForm({ experienceId, minDate }: { experienceId: string; minDate: string }) {
  const [state, action, pending] = useActionState(addSlotAction, null);
  const errors = (field: string) => fieldErrorsOf(state, field);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3" noValidate>
      <input type="hidden" name="experienceId" value={experienceId} />
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Date</span>
        <input type="date" name="startsOn" min={minDate} className={inputClass} />
        <FieldError errors={errors("startsOn")} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Start time (optional)</span>
        <input type="time" name="startTime" className={inputClass} />
      </label>
      <label className="flex w-28 flex-col gap-1">
        <span className="text-sm font-medium">Seats</span>
        <input
          type="number"
          name="capacity"
          min={1}
          max={500}
          defaultValue={8}
          className={inputClass}
        />
        <FieldError errors={errors("capacity")} />
      </label>
      <button type="submit" disabled={pending} className={secondaryButtonClass}>
        Add date
      </button>
      <div className="w-full">
        <FormAlert state={state} successMessage="Date added." />
      </div>
    </form>
  );
}

export function SlotStatusButton({
  slotId,
  status,
}: {
  slotId: string;
  status: "open" | "closed";
}) {
  const [state, action, pending] = useActionState(setSlotStatusAction, null);
  const next = status === "open" ? "closed" : "open";
  return (
    <form action={action} className="inline-flex flex-col">
      <input type="hidden" name="slotId" value={slotId} />
      <input type="hidden" name="status" value={next} />
      <button type="submit" disabled={pending} className={secondaryButtonClass}>
        {next === "closed" ? "Close date" : "Reopen date"}
      </button>
      <FormAlert state={state} />
    </form>
  );
}
