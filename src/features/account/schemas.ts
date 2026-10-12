import { z } from "zod";

export const updateProfileSchema = z.strictObject({
  displayName: z.string().trim().min(1, "Enter your name.").max(80),
});
