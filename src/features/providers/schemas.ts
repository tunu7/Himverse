import { z } from "zod";

import { EXPERIENCE_CATEGORIES } from "@/lib/catalog-options";
import { LISTING_TYPES, PRICE_UNITS_BY_TYPE } from "@/lib/listing-options";

const slug = (max: number) =>
  z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Use at least 3 characters.")
    .max(max)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens.");

export const providerApplicationSchema = z.strictObject({
  slug: slug(60),
  displayName: z.string().trim().min(2, "Enter your business name.").max(120),
  description: z.string().trim().max(4000).default(""),
  district: z.string().trim().max(80).default(""),
  legalName: z.string().trim().min(2, "Enter the registered legal name.").max(200),
  contactEmail: z.email("Enter a valid email address.").max(254),
  contactPhone: z
    .string()
    .trim()
    .max(20)
    .regex(/^(\+?[0-9][0-9 ()-]{6,19})?$/, "Enter a valid phone number.")
    .default(""),
});

export const providerIdSchema = z.strictObject({ providerId: z.uuid() });

export { EXPERIENCE_CATEGORIES };

const optionalInt = (min: number, max: number, message: string) =>
  z
    .union([z.literal(""), z.coerce.number().int().min(min, message).max(max, message)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v));

/** Type-specific listing fields (ADR-0008); the database enforces the same shape. */
const listingTypeFields = {
  listingType: z.enum(LISTING_TYPES),
  priceUnit: z.enum([
    "per_person",
    "per_group_day",
    "per_person_day",
    "per_room_night",
    "per_vehicle_trip",
    "per_vehicle_day",
  ]),
  dailyCapacity: optionalInt(1, 500, "Between 1 and 500."),
  maxGuests: optionalInt(1, 50, "Between 1 and 50."),
  languages: z
    .string()
    .max(300)
    .default("")
    .transform((v) =>
      v
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean),
    )
    .pipe(
      z
        .array(
          z
            .string()
            .max(30)
            .regex(/^[^<>]+$/, "Plain words only."),
        )
        .max(10, "At most 10 languages."),
    ),
  routeToDestinationId: z
    .union([z.literal(""), z.uuid()])
    .optional()
    .transform((v) => (v ? v : null)),
};

type TypeFields = {
  listingType: (typeof LISTING_TYPES)[number];
  priceUnit: string;
  dailyCapacity: number | null;
  maxGuests: number | null;
  routeToDestinationId: string | null;
};

function checkTypeFields(v: TypeFields, ctx: z.RefinementCtx) {
  if (!(PRICE_UNITS_BY_TYPE[v.listingType] as readonly string[]).includes(v.priceUnit)) {
    ctx.addIssue({ code: "custom", path: ["priceUnit"], message: "Choose how this is priced." });
  }
  if (v.listingType !== "experience") {
    if (v.dailyCapacity === null) {
      ctx.addIssue({ code: "custom", path: ["dailyCapacity"], message: "Required." });
    }
    if (v.maxGuests === null) {
      ctx.addIssue({ code: "custom", path: ["maxGuests"], message: "Required." });
    }
  }
  if (v.routeToDestinationId && v.listingType !== "transport") {
    ctx.addIssue({
      code: "custom",
      path: ["routeToDestinationId"],
      message: "Only for transport.",
    });
  }
}

export const newExperienceSchema = z
  .strictObject({
    providerId: z.uuid(),
    destinationId: z.uuid("Choose a destination."),
    slug: slug(80),
    title: z.string().trim().min(3, "Enter a title.").max(140),
    summary: z.string().trim().max(500).default(""),
    category: z.enum(EXPERIENCE_CATEGORIES),
    durationMinutes: z.coerce.number().int().min(15).max(43200),
    // Whole rupees in the form; stored as paise.
    priceFromRupees: z
      .union([z.literal(""), z.coerce.number().int().min(0).max(10_000_000)])
      .transform((v) => (v === "" ? null : v * 100))
      .optional()
      .transform((v) => v ?? null),
    ...listingTypeFields,
  })
  .superRefine(checkTypeFields);

export const experienceStatusSchema = z.strictObject({
  experienceId: z.uuid(),
  status: z.enum(["draft", "published", "archived"]),
});

export const acceptsBookingsSchema = z.strictObject({
  experienceId: z.uuid(),
  acceptsBookings: z.enum(["true", "false"]).transform((v) => v === "true"),
});

export const businessProfileSchema = z.strictObject({
  providerId: z.uuid(),
  displayName: z.string().trim().min(2, "Enter your business name.").max(120),
  description: z.string().trim().max(4000).default(""),
  district: z.string().trim().max(80).default(""),
});

export const businessDetailsSchema = z.strictObject({
  providerId: z.uuid(),
  legalName: z.string().trim().min(2, "Enter the registered legal name.").max(200),
  contactEmail: z.email("Enter a valid email address.").max(254),
  contactPhone: z
    .string()
    .trim()
    .max(20)
    .regex(/^(\+?[0-9][0-9 ()-]{6,19})?$/, "Enter a valid phone number.")
    .default(""),
});

export const listingSchema = z
  .strictObject({
    experienceId: z.uuid(),
    title: z.string().trim().min(3, "Enter a title.").max(140),
    slug: slug(80),
    summary: z.string().trim().max(500).default(""),
    description: z.string().trim().max(8000).default(""),
    category: z.enum(EXPERIENCE_CATEGORIES),
    destinationId: z.uuid("Choose a destination."),
    durationMinutes: z.coerce.number().int().min(15, "At least 15 minutes.").max(43200),
    priceFromRupees: z
      .union([z.literal(""), z.coerce.number().int().min(0).max(10_000_000)])
      .transform((v) => (v === "" ? null : v * 100))
      .optional()
      .transform((v) => v ?? null),
    ...listingTypeFields,
  })
  .superRefine(checkTypeFields);
