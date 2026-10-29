import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const env = { NEXT_PUBLIC_AUTH_PHONE_ENABLED: "true" as "true" | "false" };
vi.mock("@/lib/env", () => ({ getPublicEnv: () => env }));
const auth = { signInWithOtp: vi.fn(), verifyOtp: vi.fn(), updateUser: vi.fn() };
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth }) }));
const enforceLimits = vi.fn();
vi.mock("@/server/auth/request-limits", () => ({
  enforceLimits: (...args: unknown[]) => enforceLimits(...args),
  ipCheck: () => [],
  trustedClientIp: async () => null,
}));
vi.mock("@/server/auth/landing", () => ({ landingPathFor: async () => "/account" }));
const assurance = { value: { aal: "aal1", methods: [], hasVerifiedTotp: false } as unknown };
vi.mock("@/server/auth/assurance", () => ({ getAssurance: async () => assurance.value }));
vi.mock("@/server/auth/session", () => ({ requireUser: async () => ({ id: "u1", email: null }) }));

const { confirmPhoneLink, sendSignInCode, startPhoneLink, verifySignInCode } =
  await import("@/server/auth/phone");

const PHONE = "+919876543210";

beforeEach(() => {
  env.NEXT_PUBLIC_AUTH_PHONE_ENABLED = "true";
  assurance.value = { aal: "aal1", methods: [], hasVerifiedTotp: false };
  for (const fn of Object.values(auth)) fn.mockReset();
  enforceLimits.mockReset();
  enforceLimits.mockResolvedValue(undefined);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("sendSignInCode", () => {
  it("is refused while phone sign-in is switched off, before any SMS", async () => {
    env.NEXT_PUBLIC_AUTH_PHONE_ENABLED = "false";
    await expect(sendSignInCode({ phone: PHONE })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("checks the SMS limits (fail closed) before asking Supabase to text", async () => {
    enforceLimits.mockRejectedValue(Object.assign(new Error("limited"), { code: "RATE_LIMITED" }));
    await expect(sendSignInCode({ phone: PHONE })).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
    const [checks, options] = enforceLimits.mock.calls[0] as [{ bucket: string }[], object];
    expect(checks.map((c) => c.bucket)).toEqual([
      "sms_send_cooldown",
      "sms_send_phone",
      "sms_daily",
    ]);
    expect(options).toEqual({ failClosed: true });
  });

  it("texts the code through Supabase; only a chosen traveller/partner type is passed", async () => {
    auth.signInWithOtp.mockResolvedValue({ error: null });
    await sendSignInCode({ phone: PHONE, accountType: "partner" });
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      phone: PHONE,
      options: {
        channel: "sms",
        shouldCreateUser: true,
        captchaToken: undefined,
        data: { account_type: "partner" },
      },
    });
  });

  it("reports SMS provider failures as unavailable, not as the user's mistake", async () => {
    auth.signInWithOtp.mockResolvedValue({ error: { code: "sms_send_failed", status: 500 } });
    await expect(sendSignInCode({ phone: PHONE })).rejects.toMatchObject({
      code: "UPSTREAM_UNAVAILABLE",
    });
  });
});

describe("verifySignInCode", () => {
  it("refuses a wrong or expired code with one message", async () => {
    auth.verifyOtp.mockResolvedValue({
      data: { user: null },
      error: { code: "otp_expired", status: 403 },
    });
    await expect(verifySignInCode(PHONE, "000000")).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      message: "That code is wrong or has expired. Check it, or send a new one.",
    });
  });

  it("signs in and lands by role", async () => {
    auth.verifyOtp.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    expect(await verifySignInCode(PHONE, "123456")).toBe("/account");
    expect(auth.verifyOtp).toHaveBeenCalledWith({ phone: PHONE, token: "123456", type: "sms" });
  });
});

describe("phone linking", () => {
  it("needs the second step first on accounts that have one", async () => {
    assurance.value = { aal: "aal1", methods: [], hasVerifiedTotp: true };
    await expect(startPhoneLink(PHONE)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("doesn't attach a number used by another account", async () => {
    auth.updateUser.mockResolvedValue({ error: { code: "phone_exists", status: 422 } });
    await expect(startPhoneLink(PHONE)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("attaches the number only with the code sent to it", async () => {
    auth.verifyOtp.mockResolvedValue({ data: {}, error: null });
    await confirmPhoneLink(PHONE, "123456");
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      phone: PHONE,
      token: "123456",
      type: "phone_change",
    });
  });
});
