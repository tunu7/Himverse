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
  addSlotAction,
  cancelBookingAction,
  requestBookingAction,
  respondToBookingAction,
  setSlotStatusAction,
} from "../actions";
import { PendingLabel } from "@/components/ui";

export type SlotOption = { id: string; label: string; seatsLeft: number };

export function BookingRequestForm({
  experienceId,
  minDate,
  maxDate,
  slots,
  idempotencyKey,
  priceFromMinor,
}: {
  experienceId: string;
  /** First and last requestable dates (India), YYYY-MM-DD. */
  minDate: string;
  maxDate: string;
  /** Published dates, shown as availability hints; any future date can be requested. */
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
        <input
          type="date"
          name="date"
          min={minDate}
          max={maxDate}
          required
          className={inputClass}
        />
        <FieldError errors={errors("date")} />
      </label>
      {slots.length > 0 ? (
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Dates the provider has published:</span>
          <ul className="flex flex-wrap gap-2" data-testid="published-dates">
            {slots.map((s) => (
              <li key={s.id} className="rounded-full border border-line px-3 py-1 text-fg-soft">
                {s.label} · {s.seatsLeft === 0 ? "full" : `${s.seatsLeft} seats left`}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
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
        {price ? `Indicative price from ${price} per person. ` : "Price on request. "}
        The provider confirms the final price. Nothing is charged now (any deposit is paid after
        confirmation), and your booking isn&apos;t confirmed until the provider confirms it.
      </p>
      <FormAlert state={state} />
      <button type="submit" disabled={pending} className={`${buttonClass} self-start`}>
        <PendingLabel pending={pending} busy="Sending request…" idle="Request booking" />
      </button>
    </form>
  );
}

export function RespondForm({
  bookingId,
  suggestedTotalRupees,
}: {
  bookingId: string;
  suggestedTotalRupees: number | null;
}) {
  const [state, action, pending] = useActionState(respondToBookingAction, null);
  const errors = (field: string) => fieldErrorsOf(state, field);
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="bookingId" value={bookingId} />
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
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Message to the traveller (required to decline)</span>
        <textarea name="note" rows={2} maxLength={500} className={inputClass} />
        <FieldError errors={errors("note")} />
      </label>
      <FormAlert state={state} />
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          name="decision"
          value="confirmed"
          disabled={pending}
          className={buttonClass}
        >
          Confirm booking
        </button>
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
