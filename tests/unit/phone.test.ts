import { describe, expect, it } from "vitest";

import { sendPhoneCodeSchema, verifyPhoneCodeSchema } from "@/features/auth/schemas";
import { toE164 } from "@/lib/phone";

describe("toE164", () => {
  it.each([
    ["IN", "98765 43210", "+919876543210"],
    ["IN", "098765-43210", "+919876543210"],
    ["IN", "+91 98765 43210", "+919876543210"],
    ["IN", "0091 9876543210", "+919876543210"],
    ["NP", "9812345678", "+9779812345678"],
    ["GB", "07700 900123", "+447700900123"],
    ["US", "(415) 555-2671", "+14155552671"],
  ] as const)("%s %s → %s", (country, typed, expected) => {
    expect(toE164(country, typed)).toBe(expected);
  });

  it.each([
    ["IN", "12345"], // too short
    ["IN", "5876543210"], // not a mobile prefix
    ["IN", "+44 7700 900123"], // another country's code
    ["IN", "98765abc10"], // letters
    ["GB", "020 7946 0018"], // a landline
  ] as const)("refuses %s %s", (country, typed) => {
    expect(toE164(country, typed)).toBeNull();
  });
});

describe("phone schemas", () => {
  it("converts the typed number to international form on the server", () => {
    const parsed = sendPhoneCodeSchema.safeParse({ country: "IN", phone: "98765 43210" });
    expect(parsed.success && parsed.data.phone).toBe("+919876543210");
  });

  it("reports an invalid number on the phone field", () => {
    const parsed = sendPhoneCodeSchema.safeParse({ country: "IN", phone: "123" });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(["phone"]);
  });

  it("accepts only the listed countries, the user's own account types, and no extra fields", () => {
    expect(sendPhoneCodeSchema.safeParse({ country: "XX", phone: "9876543210" }).success).toBe(
      false,
    );
    expect(
      sendPhoneCodeSchema.safeParse({ country: "IN", phone: "9876543210", accountType: "admin" })
        .success,
    ).toBe(false);
    expect(
      sendPhoneCodeSchema.safeParse({ country: "IN", phone: "9876543210", role: "admin" }).success,
    ).toBe(false);
  });

  it("accepts a 6-digit code with spaces, and only an international number", () => {
    expect(
      verifyPhoneCodeSchema.safeParse({ phone: "+919876543210", code: "123 456" }).data,
    ).toEqual({ phone: "+919876543210", code: "123456" });
    expect(verifyPhoneCodeSchema.safeParse({ phone: "9876543210", code: "123456" }).success).toBe(
      false,
    );
    expect(verifyPhoneCodeSchema.safeParse({ phone: "+919876543210", code: "12345" }).success).toBe(
      false,
    );
  });
});
