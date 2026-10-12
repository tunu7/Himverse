import { z } from "zod";

export const reviewProviderSchema = z.strictObject({
  providerId: z.uuid(),
  decision: z.enum(["verified", "rejected", "suspended"]),
  note: z.string().trim().max(1000).default(""),
});
