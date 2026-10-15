import { z } from "zod";

export const reviewProviderSchema = z.strictObject({
  providerId: z.uuid(),
  decision: z.enum(["verified", "rejected", "suspended"]),
  note: z.string().trim().max(1000).default(""),
});

// Mirrors the destinations table constraints (catalog migration).
export const destinationSchema = z.strictObject({
  id: z.uuid().optional(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "At least 2 characters.")
    .max(60)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Lowercase letters, numbers and single hyphens only."),
  name: z.string().trim().min(2, "At least 2 characters.").max(120),
  district: z.string().trim().min(2, "At least 2 characters.").max(80),
  summary: z.string().trim().max(500).default(""),
  description: z.string().trim().max(8000).default(""),
  // Checkbox: present ("on") when checked, absent otherwise.
  isPublished: z
    .literal("on")
    .optional()
    .transform((v) => v === "on"),
});

export const destinationIdSchema = z.strictObject({ id: z.uuid() });

export const moderateExperienceSchema = z.strictObject({
  experienceId: z.uuid(),
  action: z.enum(["publish", "unpublish", "archive"]),
});

export const depositsSwitchSchema = z.strictObject({
  required: z.enum(["true", "false"]).transform((v) => v === "true"),
});

/** Rupees with up to two decimals, as paise. */
export const payoutSchema = z.strictObject({
  providerId: z.uuid(),
  amountRupees: z
    .string()
    .trim()
    .regex(/^\d{1,8}(\.\d{1,2})?$/, "Enter an amount in rupees, e.g. 1500 or 1500.50.")
    .transform((v) => Math.round(Number(v) * 100))
    .refine((v) => v > 0, "Enter an amount above zero."),
  reference: z.string().trim().min(1, "Enter the bank transfer reference.").max(100),
  note: z.string().trim().max(300).default(""),
});
