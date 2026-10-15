import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { signedInRecently, RECENT_SIGN_IN_SECONDS } = await import("@/server/auth/account-deletion");
const { deleteAccountSchema } = await import("@/features/account/schemas");

describe("signedInRecently", () => {
  const now = Date.parse("2026-10-15T12:00:00Z");
  const at = (secondsAgo: number) => now / 1000 - secondsAgo;

  it("accepts any sign-in method within the window", () => {
    expect(signedInRecently([{ method: "oauth", at: at(60) }], RECENT_SIGN_IN_SECONDS, now)).toBe(
      true,
    );
    expect(
      signedInRecently(
        [
          { method: "oauth", at: at(3600) },
          { method: "totp", at: at(120) },
        ],
        RECENT_SIGN_IN_SECONDS,
        now,
      ),
    ).toBe(true);
  });

  it("ignores methods that don't prove the person is present", () => {
    expect(signedInRecently([{ method: "invite", at: at(60) }], RECENT_SIGN_IN_SECONDS, now)).toBe(
      false,
    );
  });

  it("refuses old sign-ins and methods without a time", () => {
    expect(signedInRecently([{ method: "oauth", at: at(901) }], RECENT_SIGN_IN_SECONDS, now)).toBe(
      false,
    );
    expect(signedInRecently([{ method: "password", at: null }], RECENT_SIGN_IN_SECONDS, now)).toBe(
      false,
    );
    expect(signedInRecently([], RECENT_SIGN_IN_SECONDS, now)).toBe(false);
  });
});

describe("deleteAccountSchema", () => {
  it("needs the word DELETE, in any case", () => {
    expect(deleteAccountSchema.safeParse({ confirm: " delete " }).success).toBe(true);
    expect(deleteAccountSchema.safeParse({ confirm: "DELETE", code: "123456" }).success).toBe(true);
    expect(deleteAccountSchema.safeParse({ confirm: "DELETE", code: "12345" }).success).toBe(false);
    expect(deleteAccountSchema.safeParse({ confirm: "yes" }).success).toBe(false);
    expect(deleteAccountSchema.safeParse({ confirm: "DELETE", role: "admin" }).success).toBe(false);
    expect(
      deleteAccountSchema.safeParse({ confirm: "DELETE", password: "x".repeat(73) }).success,
    ).toBe(false);
  });
});
