"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  buttonClass,
  FieldError,
  fieldErrorsOf,
  FormAlert,
  inputClass,
} from "@/components/form-feedback";
import { PendingLabel } from "@/components/ui";

import { bookTripAction } from "../actions";

/** One request: a stay's consecutive nights share a booking, so a line can cover several item ids. */
export type TripBookingItem = { ids: readonly string[]; title: string; dateLabel: string };

/**
 * "Book whole trip": one request per experience, transport leg and stay. Each
 * provider confirms its own request; nothing is booked until they do.
 */
export function TripBookingForm({
  versionId,
  items,
  idempotencyKey,
}: {
  versionId: string;
  items: readonly TripBookingItem[];
  idempotencyKey: string;
}) {
  const [state, action, pending] = useActionState(bookTripAction, null);
  if (state?.ok) {
    const byId = new Map(state.data.items.map((r) => [r.itemId, r]));
    // One result per line; every id of a stay maps to the same booking.
    const results = items.flatMap((item) => {
      const id = item.ids.find((i) => byId.has(i));
      const result = id === undefined ? undefined : byId.get(id);
      return result ? [{ ...result, item }] : [];
    });
    const sent = results.filter((r) => r.booking).length;
    return (
      <div className="flex flex-col gap-3" data-testid="trip-booking-results" role="status">
        <p className="font-medium">
          {sent === results.length
            ? "Booking requests sent for every item."
            : `${sent} of ${results.length} items requested.`}{" "}
          <span className="font-normal text-muted">
            Each provider confirms its own request; nothing is booked until they do.
          </span>
        </p>
        <ul className="flex flex-col gap-2 text-sm">
          {results.map((r) => {
            const { item } = r;
            return (
              <li
                key={r.itemId}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-line p-3"
              >
                <span>
                  <span className="font-medium">{item.title}</span>
                  <span className="text-muted"> · {item.dateLabel}</span>
                </span>
                {r.booking ? (
                  <Link
                    href={`/bookings/${r.booking.id}`}
                    className="font-medium text-accent underline-offset-4 hover:underline"
                  >
                    {r.alreadyRequested ? "Already requested" : "Requested"} · {r.booking.reference}
                  </Link>
                ) : (
                  <span className={r.alreadyRequested ? "text-muted" : "text-danger"}>
                    {r.alreadyRequested
                      ? "Already requested — see your bookings"
                      : (r.error ?? "Could not request")}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        <Link
          href="/bookings"
          className="self-start text-sm font-semibold text-accent underline-offset-4 hover:underline"
        >
          View all your bookings →
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {/* Same key on retries and double clicks: each item replays instead of duplicating. */}
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="versionId" value={versionId} />
      <p className="text-sm text-fg-soft">
        Sends {items.length} booking {items.length === 1 ? "request" : "requests"} for this
        trip&apos;s travellers: each experience and transport leg on its planned day, and each stay
        for its nights. Partners confirm availability and the final price. Nothing is charged.
      </p>
      <ul className="flex flex-col gap-1 text-sm" data-testid="trip-booking-lines">
        {items.map((item) => (
          <li key={item.ids[0]}>
            <span className="font-medium">{item.title}</span>
            <span className="text-muted"> · {item.dateLabel}</span>
          </li>
        ))}
      </ul>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">
          Contact phone (shared with each provider for these bookings)
        </span>
        <input
          type="tel"
          name="contactPhone"
          autoComplete="tel"
          maxLength={20}
          className={inputClass}
        />
        <FieldError errors={fieldErrorsOf(state, "contactPhone")} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Message to the providers (optional)</span>
        <textarea name="note" rows={2} maxLength={500} className={inputClass} />
      </label>
      <FormAlert state={state} />
      <button type="submit" disabled={pending} className={`${buttonClass} self-start`}>
        <PendingLabel pending={pending} busy="Sending requests…" idle="Book whole trip" />
      </button>
    </form>
  );
}
