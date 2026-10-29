import { z } from "zod";

import { captchaTokenField } from "@/lib/captcha";
import { E164, PHONE_COUNTRY_CODES, type PhoneCountryCode, toE164 } from "@/lib/phone";

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
  captchaToken: captchaTokenField,
});

export const signInSchema = z.strictObject({
  email: z.email("Enter a valid email address.").max(254),
  password: password.min(1, "Enter your password."),
  next: z.string().max(512).optional(),
  captchaToken: captchaTokenField,
});

export const chooseAccountTypeSchema = z.strictObject({
  accountType: z.enum(ACCOUNT_CHOICES, "Choose how you'll use Himverse."),
  next: z.string().max(512).optional(),
});

export const emailOnlySchema = z.strictObject({
  email: z.email("Enter a valid email address.").max(254),
  captchaToken: captchaTokenField,
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
    captchaToken: captchaTokenField,
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

// Phone sign-in (ADR-0011): the number is typed in national form with a country
// and converted to international (E.164) form here, on the server.
const phoneNumberFields = {
  country: z.enum(PHONE_COUNTRY_CODES, "Choose a country."),
  phone: z.string().trim().min(1, "Enter your mobile number.").max(32),
};

function toPhone<T extends { country: PhoneCountryCode; phone: string }>(
  value: T,
  ctx: z.RefinementCtx,
): (Omit<T, "phone"> & { phone: string }) | typeof z.NEVER {
  const e164 = toE164(value.country, value.phone);
  if (!e164) {
    ctx.addIssue({
      code: "custom",
      path: ["phone"],
      message: "Enter a valid mobile number for the chosen country.",
    });
    return z.NEVER;
  }
  return { ...value, phone: e164 };
}

export const sendPhoneCodeSchema = z
  .strictObject({
    ...phoneNumberFields,
    // Only on the sign-up page; applied by the database to new accounts only.
    accountType: z.enum(ACCOUNT_CHOICES).optional(),
    next: z.string().max(512).optional(),
    captchaToken: captchaTokenField,
  })
  .transform(toPhone);

const smsCode = z
  .string()
  .transform((v) => v.replace(/\s+/g, ""))
  .pipe(z.string().regex(/^\d{6}$/, "Enter the 6-digit code we sent by SMS."));

export const verifyPhoneCodeSchema = z.strictObject({
  phone: z.string().regex(E164, "Start again with your mobile number."),
  code: smsCode,
  next: z.string().max(512).optional(),
});

export const startPhoneLinkSchema = z.strictObject(phoneNumberFields).transform(toPhone);

export const confirmPhoneLinkSchema = z.strictObject({
  phone: z.string().regex(E164, "Start again with your mobile number."),
  code: smsCode,
});
