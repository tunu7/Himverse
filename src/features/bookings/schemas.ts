import { z } from "zod";

import { MAX_PARTY_SIZE } from "@/lib/booking-options";

const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9][0-9 ()-]{6,19}$/, "Enter a phone number the provider can reach you on.");

export const requestBookingSchema = z
  .strictObject({
    slotId: z.uuid("Choose a date."),
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
