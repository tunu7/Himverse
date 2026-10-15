"use client";

import { useActionState, useState } from "react";

import {
  buttonClass,
  FieldError,
  fieldErrorsOf,
  FormAlert,
  inputClass,
} from "@/components/form-feedback";
import { PendingLabel } from "@/components/ui";
import { MAX_PARTY_SIZE } from "@/lib/booking-options";
import { formatPriceFrom } from "@/lib/format";
import {
  CAPACITY_LABELS,
  capacityText,
  estimateTotalMinor,
  type ListingType,
  type PriceUnit,
  serviceDays,
} from "@/lib/listing-options";

import { requestListingBookingAction } from "../actions";

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Request form for guides, stays and transport: dates, quantity and party,
 * with a live estimate using the same formula as the database.
 */
export function ListingBookingForm({
  experienceId,
  listingType,
  priceUnit,
  priceFromMinor,
  dailyCapacity,
  maxGuests,
  minDate,
  maxDate,
  idempotencyKey,
}: {
  experienceId: string;
  listingType: Exclude<ListingType, "experience">;
  priceUnit: PriceUnit;
  priceFromMinor: number | null;
  dailyCapacity: number;
  maxGuests: number;
  minDate: string;
  maxDate: string;
  idempotencyKey: string;
}) {
  const [state, action, pending] = useActionState(requestListingBookingAction, null);
  const errors = (f: string) => fieldErrorsOf(state, f);
  const labels = CAPACITY_LABELS[listingType];
  const [startsOn, setStartsOn] = useState("");
  const [end, setEnd] = useState("");
  const [units, setUnits] = useState(1);
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);

  const isStay = listingType === "stay";
  const singleDay = priceUnit === "per_vehicle_trip";
  // Stays: check-out is exclusive; others: the last day is inclusive.
  const lastDay = isStay ? (end ? addDays(end, -1) : "") : singleDay ? startsOn : end || startsOn;
  const days = startsOn && lastDay && lastDay >= startsOn ? serviceDays(startsOn, lastDay) : 0;
  const estimate =
    days > 0 ? estimateTotalMinor(priceUnit, priceFromMinor, adults + children, units, days) : null;
  const formatted = estimate === null ? null : formatPriceFrom(estimate);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="experienceId" value={experienceId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">
            {isStay ? "Check-in" : singleDay ? "Date" : "Start date"}
          </span>
          <input
            type="date"
            name="startsOn"
            min={minDate}
            max={maxDate}
            required
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
            className={inputClass}
          />
          <FieldError errors={errors("startsOn")} />
        </label>
        {singleDay ? null : (
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">{isStay ? "Check-out" : "End date"}</span>
            <input
              type="date"
              name={isStay ? "checkOut" : "endsOn"}
              min={startsOn ? (isStay ? addDays(startsOn, 1) : startsOn) : minDate}
              max={maxDate}
              required={isStay}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className={inputClass}
            />
            <FieldError errors={errors(isStay ? "checkOut" : "endsOn")} />
          </label>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium capitalize">{labels.unitOne}s</span>
          <input
            type="number"
            name="units"
            min={1}
            max={dailyCapacity}
            value={units}
            onChange={(e) => setUnits(Number(e.target.value) || 1)}
            className={inputClass}
          />
          <FieldError errors={errors("units")} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Adults</span>
          <input
            type="number"
            name="adults"
            min={1}
            max={MAX_PARTY_SIZE}
            value={adults}
            onChange={(e) => setAdults(Number(e.target.value) || 1)}
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
            value={children}
            onChange={(e) => setChildren(Number(e.target.value) || 0)}
            className={inputClass}
          />
          <FieldError errors={errors("children")} />
        </label>
      </div>
      <p className="text-xs text-subtle">
        Up to {maxGuests} people per {labels.unitOne}; {capacityText(listingType, dailyCapacity)}.
        The partner confirms what&apos;s free on your dates.
      </p>
      {listingType === "transport" ? (
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Pickup point and time (optional)</span>
          <input name="pickupNote" maxLength={200} className={inputClass} />
        </label>
      ) : null}
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">
          Contact phone (shared with the partner for this booking)
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
        <span className="text-sm font-medium">Message to the partner (optional)</span>
        <textarea name="note" rows={2} maxLength={500} className={inputClass} />
      </label>
      <p className="text-sm text-muted" data-testid="listing-estimate">
        {formatted
          ? `Estimated from ${formatted} for ${days} ${isStay ? (days === 1 ? "night" : "nights") : days === 1 ? "day" : "days"}. `
          : priceFromMinor === null
            ? "Price on request. "
            : ""}
        The partner confirms availability and the final price. Nothing is charged now; if a deposit
        is needed, you pay it after the partner confirms.
      </p>
      <FormAlert state={state} />
      <button type="submit" disabled={pending} className={`${buttonClass} self-start`}>
        <PendingLabel pending={pending} busy="Sending request…" idle="Request booking" />
      </button>
    </form>
  );
}
