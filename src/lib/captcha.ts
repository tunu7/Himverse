import { z } from "zod";

/**
 * CAPTCHA token from the Turnstile widget (ADR-0010), posted with auth forms as
 * `captchaToken`. Optional: empty when the widget is off (no site key) or not
 * solved yet. Supabase Auth verifies it when CAPTCHA is enabled there.
 */
export const CAPTCHA_FIELD = "captchaToken";

export const captchaTokenField = z
  .string()
  .max(4096)
  .optional()
  .transform((token) => token || undefined);
