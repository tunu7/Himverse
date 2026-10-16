import { afterEach, describe, expect, it, vi } from "vitest";

import { deleteAccountSchema } from "@/features/account/schemas";
import {
  changePasswordSchema,
  emailOnlySchema,
  signInSchema,
  signUpSchema,
} from "@/features/auth/schemas";
import { getTurnstileSiteKey } from "@/lib/env";
import { parseInput } from "@/lib/validation";
import {
  captchaError,
  isCaptchaFailure,
  signInError,
  signUpError,
} from "@/server/auth/auth-errors";

// CAPTCHA with Cloudflare Turnstile through Supabase Auth (ADR-0010).

const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.append(k, v);
  return data;
};

describe("captcha token in auth forms", () => {
  const forms = [
    ["signIn", signInSchema, { email: "a@b.co", password: "secret123" }],
    [
      "signUp",
      signUpSchema,
      { accountType: "traveller", displayName: "A", email: "a@b.co", password: "secret123" },
    ],
    ["emailOnly", emailOnlySchema, { email: "a@b.co" }],
    [
      "changePassword",
      changePasswordSchema,
      { currentPassword: "old-secret", password: "new-secret1", confirmPassword: "new-secret1" },
    ],
    ["deleteAccount", deleteAccountSchema, { password: "secret123", confirm: "DELETE" }],
  ] as const;

  it.each(forms)("%s accepts the widget's token", (_name, schema, fields) => {
    expect(parseInput(schema, form({ ...fields, captchaToken: "tok_123" }))).toMatchObject({
      captchaToken: "tok_123",
    });
  });

  it.each(forms)("%s works without the widget (token absent or empty)", (_name, schema, fields) => {
    expect(parseInput(schema, form(fields)).captchaToken).toBeUndefined();
    expect(parseInput(schema, form({ ...fields, captchaToken: "" })).captchaToken).toBeUndefined();
  });

  it("refuses an oversized token", () => {
    expect(() =>
      parseInput(
        signInSchema,
        form({ email: "a@b.co", password: "x", captchaToken: "a".repeat(5000) }),
      ),
    ).toThrow();
  });
});

describe("captcha failures from Supabase Auth", () => {
  it("asks for the security check instead of blaming the password or address", () => {
    const failure = { code: "captcha_failed", status: 400 };
    expect(isCaptchaFailure(failure)).toBe(true);
    for (const error of [signInError(failure), signUpError(failure), captchaError(failure)]) {
      expect(error).toMatchObject({
        code: "VALIDATION_FAILED",
        message: "Please complete the security check and try again.",
      });
    }
    expect(isCaptchaFailure({ code: "invalid_credentials", status: 400 })).toBe(false);
  });
});

describe("getTurnstileSiteKey", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is off when unset or malformed", () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    expect(getTurnstileSiteKey()).toBeUndefined();
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "<script>");
    expect(getTurnstileSiteKey()).toBeUndefined();
  });

  it("returns a configured key", () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "0x4AAAAAAABBBBccccDDDD");
    expect(getTurnstileSiteKey()).toBe("0x4AAAAAAABBBBccccDDDD");
  });
});
