import { z } from "zod";

// Supabase/bcrypt ignore bytes beyond 72; cap to avoid silent truncation.
const password = z.string().max(72, "Use at most 72 characters.");

export const signUpSchema = z.strictObject({
  displayName: z.string().trim().min(1, "Enter your name.").max(80),
  email: z.email("Enter a valid email address.").max(254),
  password: password.min(8, "Use at least 8 characters."),
  next: z.string().max(512).optional(),
});

export const signInSchema = z.strictObject({
  email: z.email("Enter a valid email address.").max(254),
  password: password.min(1, "Enter your password."),
  next: z.string().max(512).optional(),
});
