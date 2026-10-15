"use client";

import { FieldError, inputClass } from "@/components/form-feedback";
import {
  CAPACITY_LABELS,
  LISTING_TYPE_LABELS,
  type ListingType,
  PRICE_UNIT_LABELS,
  PRICE_UNITS_BY_TYPE,
  type PriceUnit,
} from "@/lib/listing-options";
import type { PublicDestination } from "@/server/catalog/catalog";

/** Default time for types where partners don't set one (minutes). */
const DEFAULT_DURATION: Record<ListingType, number | null> = {
  experience: null,
  transport: null,
  guide: 480,
  stay: 1440,
};

/**
 * The fields that differ by listing type (ADR-0008): price unit, capacity,
 * guests, languages (guides), route (transport) and duration.
 */
export function ListingTypeFields({
  listingType,
  defaults,
  destinations,
  errors,
}: {
  listingType: ListingType;
  defaults?: {
    priceUnit?: PriceUnit;
    dailyCapacity?: number | null;
    maxGuests?: number | null;
    languages?: string[];
    routeToDestinationId?: string | null;
    durationMinutes?: number;
  };
  destinations: readonly PublicDestination[];
  errors: (field: string) => readonly string[] | undefined;
}) {
  const units = PRICE_UNITS_BY_TYPE[listingType];
  const fixedDuration = DEFAULT_DURATION[listingType];
  return (
    <>
      <input type="hidden" name="listingType" value={listingType} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Priced</span>
          <select
            name="priceUnit"
            defaultValue={defaults?.priceUnit ?? units[0]}
            className={inputClass}
          >
            {units.map((u) => (
              <option key={u} value={u}>
                {PRICE_UNIT_LABELS[u]}
              </option>
            ))}
          </select>
          <FieldError errors={errors("priceUnit")} />
        </label>
        {fixedDuration !== null ? (
          <input
            type="hidden"
            name="durationMinutes"
            value={defaults?.durationMinutes ?? fixedDuration}
          />
        ) : (
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">
              {listingType === "transport" ? "Typical trip time (minutes)" : "Duration (minutes)"}
            </span>
            <input
              type="number"
              name="durationMinutes"
              min={15}
              max={43200}
              required
              defaultValue={defaults?.durationMinutes}
              className={inputClass}
            />
            <FieldError errors={errors("durationMinutes")} />
          </label>
        )}
      </div>
      {listingType !== "experience" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">{CAPACITY_LABELS[listingType].units}</span>
            <input
              type="number"
              name="dailyCapacity"
              min={1}
              max={500}
              required
              defaultValue={defaults?.dailyCapacity ?? 1}
              className={inputClass}
            />
            <FieldError errors={errors("dailyCapacity")} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">{CAPACITY_LABELS[listingType].perUnit}</span>
            <input
              type="number"
              name="maxGuests"
              min={1}
              max={50}
              required
              defaultValue={
                defaults?.maxGuests ??
                (listingType === "stay" ? 2 : listingType === "transport" ? 4 : 8)
              }
              className={inputClass}
            />
            <FieldError errors={errors("maxGuests")} />
          </label>
        </div>
      ) : null}
      {listingType === "guide" ? (
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Languages (comma-separated)</span>
          <input
            name="languages"
            maxLength={300}
            placeholder="English, Hindi, Apatani"
            defaultValue={defaults?.languages?.join(", ") ?? ""}
            className={inputClass}
          />
          <FieldError errors={errors("languages")} />
        </label>
      ) : null}
      {listingType === "transport" ? (
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">
            Route to (leave empty for day hire around the destination)
          </span>
          <select
            name="routeToDestinationId"
            defaultValue={defaults?.routeToDestinationId ?? ""}
            className={inputClass}
          >
            <option value="">Day hire / local trips</option>
            {destinations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.district})
              </option>
            ))}
          </select>
          <FieldError errors={errors("routeToDestinationId")} />
        </label>
      ) : null}
    </>
  );
}

export function ListingTypeBadge({ listingType }: { listingType: ListingType }) {
  return (
    <span className="rounded-full border border-line px-2 py-0.5 text-xs font-medium text-fg-soft">
      {LISTING_TYPE_LABELS[listingType].one}
    </span>
  );
}
