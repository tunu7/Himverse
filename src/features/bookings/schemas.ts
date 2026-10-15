import { z } from "zod";

import { MAX_PARTY_SIZE } from "@/lib/booking-options";

const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9][0-9 ()-]{6,19}$/, "Enter a phone number the provider can reach you on.");

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date.")
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), "Choose a valid date.");

export const requestBookingSchema = z
  .strictObject({
    experienceId: z.uuid(),
    date: isoDate,
    adults: z.coerce.number().int().min(1, "At least one adult.").max(MAX_PARTY_SIZE),
    children: z.coerce
      .number()
      .int()
      .min(0)
      .max(MAX_PARTY_SIZE - 1)
      .default(0),
    contactPhone: phone,
    note: z.string().trim().max(500).default(""),
    // Generated server-side per rendered form; resubmitting reuses it (ADR-0004).
    idempotencyKey: z.uuid(),
  })
  .refine((b) => b.adults + b.children <= MAX_PARTY_SIZE, {
    path: ["children"],
    message: `At most ${MAX_PARTY_SIZE} people per booking.`,
  });

/** "Book whole trip": party and dates come from the stored itinerary version. */
export const tripBookingSchema = z.strictObject({
  versionId: z.uuid(),
  contactPhone: phone,
  note: z.string().trim().max(500).default(""),
  idempotencyKey: z.uuid(),
});

export const respondSchema = z
  .strictObject({
    bookingId: z.uuid(),
    decision: z.enum(["confirmed", "declined"]),
    finalTotalRupees: z
      .union([z.literal(""), z.coerce.number().int().min(0).max(10_000_000)])
      .optional(),
    note: z.string().trim().max(500).default(""),
  })
  .refine((r) => r.decision !== "confirmed" || typeof r.finalTotalRupees === "number", {
    path: ["finalTotalRupees"],
    message: "Enter the final price to confirm.",
  })
  .refine((r) => r.decision !== "declined" || r.note.length > 0, {
    path: ["note"],
    message: "Give the traveller a reason.",
  });

export const cancelSchema = z.strictObject({
  bookingId: z.uuid(),
  reason: z.string().trim().max(500).default(""),
});

export const addSlotSchema = z.strictObject({
  experienceId: z.uuid(),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date."),
  startTime: z.union([z.literal(""), z.string().regex(/^\d{2}:\d{2}$/)]).default(""),
  capacity: z.coerce.number().int().min(1, "At least 1 seat.").max(500),
});

export const slotStatusSchema = z.strictObject({
  slotId: z.uuid(),
  status: z.enum(["open", "closed"]),
});

/**
 * A guide, stay or transport request. Stays send check-out (the morning
 * after the last night); others send their last service day. The database
 * re-checks everything against the listing's type, capacity and price unit.
 */
export const listingBookingSchema = z
  .strictObject({
    experienceId: z.uuid(),
    startsOn: isoDate,
    endsOn: isoDate.optional(),
    checkOut: isoDate.optional(),
    units: z.coerce.number().int().min(1, "At least 1.").max(50),
    adults: z.coerce.number().int().min(1, "At least one adult.").max(MAX_PARTY_SIZE),
    children: z.coerce
      .number()
      .int()
      .min(0)
      .max(MAX_PARTY_SIZE - 1)
      .default(0),
    contactPhone: phone,
    note: z.string().trim().max(500).default(""),
    pickupNote: z.string().trim().max(200).default(""),
    idempotencyKey: z.uuid(),
  })
  .refine((b) => b.adults + b.children <= MAX_PARTY_SIZE, {
    path: ["children"],
    message: `At most ${MAX_PARTY_SIZE} people per booking.`,
  })
  .refine((b) => !b.checkOut || b.checkOut > b.startsOn, {
    path: ["checkOut"],
    message: "Check-out must be after check-in.",
  })
  .refine((b) => !b.endsOn || b.endsOn >= b.startsOn, {
    path: ["endsOn"],
    message: "The end date can't be before the start date.",
  });

export const depositBookingSchema = z.strictObject({ bookingId: z.uuid() });

/** What Razorpay Checkout hands back on success; verified on the server. */
export const depositResultSchema = z.strictObject({
  orderId: z.string().regex(/^order_[A-Za-z0-9]{8,40}$/),
  paymentId: z.string().regex(/^pay_[A-Za-z0-9]{8,40}$/),
  signature: z.string().regex(/^[0-9a-f]{64}$/),
});
