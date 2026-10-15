import { z } from "zod";

/** Shared with the sign-in form, which offers "resend" for this case. */
export const EMAIL_NOT_CONFIRMED_MESSAGE =
  "Please confirm your email address first. Check your inbox for the link.";

// Supabase/bcrypt ignore bytes beyond 72; cap to avoid silent truncation.
const password = z.string().max(72, "Use at most 72 characters.");

/** Chosen at sign-up; admin is never self-serve (ADR-0007). */
export const ACCOUNT_CHOICES = ["traveller", "partner"] as const;

export const signUpSchema = z.strictObject({
  accountType: z.enum(ACCOUNT_CHOICES, "Choose traveller or partner."),
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

export const chooseAccountTypeSchema = z.strictObject({
  accountType: z.enum(ACCOUNT_CHOICES, "Choose how you'll use Himverse."),
  next: z.string().max(512).optional(),
});

export const emailOnlySchema = z.strictObject({
  email: z.email("Enter a valid email address.").max(254),
});

export const newPasswordSchema = z
  .strictObject({
    password: password.min(8, "Use at least 8 characters."),
    confirmPassword: z.string().max(72),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "The passwords don't match.",
  });

export const changePasswordSchema = z
  .strictObject({
    currentPassword: password.min(1, "Enter your current password."),
    password: password.min(8, "Use at least 8 characters."),
    confirmPassword: z.string().max(72),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "The passwords don't match.",
  })
  .refine((v) => v.password !== v.currentPassword, {
    path: ["password"],
    message: "Choose a password different from your current one.",
  });

const totpCode = z
  .string()
  .transform((v) => v.replace(/\s+/g, ""))
  .pipe(z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app."));

export const verifySecondStepSchema = z.strictObject({
  code: totpCode,
  next: z.string().max(512).optional(),
});

export const confirmTotpSchema = z.strictObject({
  factorId: z.uuid(),
  code: totpCode,
  next: z.string().max(512).optional(),
});
