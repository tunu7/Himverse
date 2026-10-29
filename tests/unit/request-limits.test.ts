import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const headerValues = new Map<string, string>();
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => headerValues.get(name) ?? null }),
}));
const limitsEnv = { SMS_DAILY_LIMIT: 200 };
vi.mock("@/lib/env.server", () => ({ getAuthLimitsEnv: () => limitsEnv }));
const hitRateLimit = vi.fn();
vi.mock("@/server/auth/limiter-db", () => ({ hitRateLimit: (i: unknown) => hitRateLimit(i) }));

const { checkLimits, enforceLimits, trustedClientIp, LIMITS } =
  await import("@/server/auth/request-limits");

beforeEach(() => {
  headerValues.clear();
  limitsEnv.SMS_DAILY_LIMIT = 200;
  hitRateLimit.mockReset();
  hitRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 10 });
  vi.unstubAllEnvs();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("trustedClientIp", () => {
  it("ignores forwarding headers off Vercel (they are client-controlled there)", async () => {
    headerValues.set("x-forwarded-for", "203.0.113.9");
    expect(await trustedClientIp()).toBeNull();
  });

  it("uses the first x-forwarded-for entry on Vercel", async () => {
    vi.stubEnv("VERCEL", "1");
    headerValues.set("x-forwarded-for", "203.0.113.9, 10.0.0.1");
    expect(await trustedClientIp()).toBe("203.0.113.9");
  });

  it("refuses values that aren't IP addresses", async () => {
    vi.stubEnv("VERCEL", "1");
    headerValues.set("x-forwarded-for", "<script>");
    expect(await trustedClientIp()).toBeNull();
  });
});

describe("checkLimits", () => {
  it("counts every bucket with hashed keys and the configured rule", async () => {
    await checkLimits(
      [
        { bucket: "sign_in_email", key: "person@example.test" },
        { bucket: "sign_in_ip", key: "203.0.113.9" },
      ],
      { failClosed: false },
    );
    expect(hitRateLimit).toHaveBeenCalledTimes(2);
    const first = hitRateLimit.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(first).toMatchObject({ bucket: "sign_in_email", ...LIMITS.sign_in_email });
    expect(first.keyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(hitRateLimit.mock.calls)).not.toContain("person@example.test");
  });

  it("reports the longest wait when any limit is exceeded", async () => {
    hitRateLimit
      .mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 30 })
      .mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 400 });
    expect(
      await checkLimits(
        [
          { bucket: "sms_send_cooldown", key: "+919876543210" },
          { bucket: "sms_send_phone", key: "+919876543210" },
        ],
        { failClosed: true },
      ),
    ).toEqual({ allowed: false, retryAfterSeconds: 400 });
  });

  it("fails open for sign-in when the counter is unreachable", async () => {
    hitRateLimit.mockRejectedValue(new Error("down"));
    expect(
      await checkLimits([{ bucket: "sign_in_ip", key: "203.0.113.9" }], { failClosed: false }),
    ).toEqual({ allowed: true });
  });

  it("fails closed for SMS when the counter is unreachable", async () => {
    hitRateLimit.mockRejectedValue(new Error("down"));
    await expect(
      checkLimits([{ bucket: "sms_send_phone", key: "+919876543210" }], { failClosed: true }),
    ).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
  });

  it("stops all SMS when the daily budget is 0", async () => {
    limitsEnv.SMS_DAILY_LIMIT = 0;
    expect(
      await checkLimits([{ bucket: "sms_daily", key: "platform" }], { failClosed: true }),
    ).toMatchObject({ allowed: false });
    expect(hitRateLimit).not.toHaveBeenCalled();
  });

  it("does nothing without checks (no IP known locally)", async () => {
    expect(await checkLimits([], { failClosed: true })).toEqual({ allowed: true });
    expect(hitRateLimit).not.toHaveBeenCalled();
  });
});

describe("enforceLimits", () => {
  it("throws RATE_LIMITED (HTTP 429) with how long to wait", async () => {
    hitRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 45 });
    await expect(
      enforceLimits([{ bucket: "sms_send_cooldown", key: "+919876543210" }], { failClosed: true }),
    ).rejects.toMatchObject({
      code: "RATE_LIMITED",
      httpStatus: 429,
      message: "Too many attempts. Please wait 45 seconds and try again.",
    });
  });
});
