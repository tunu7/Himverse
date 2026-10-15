import { z } from "zod";

export const updateProfileSchema = z.strictObject({
  displayName: z.string().trim().min(1, "Enter your name.").max(80),
});

/** Typing the word guards against a mis-click; the password is re-checked on the server. */
export const deleteAccountSchema = z.strictObject({
  password: z.string().max(72).optional(),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app.")
    .optional(),
  confirm: z
    .string()
    .trim()
    .refine((v) => v.toUpperCase() === "DELETE", 'Type "DELETE" to confirm.'),
});
