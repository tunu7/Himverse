import { describe, expect, it, vi } from "vitest";

import { logger, redact } from "@/lib/logger";

describe("logger", () => {
  it("writes one JSON line with level, event and fields", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.error("bookings.request_failed", { userId: "u-1", code: "XX000" });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(String(spy.mock.calls[0]?.[0]));
    expect(line).toMatchObject({
      level: "error",
      event: "bookings.request_failed",
      userId: "u-1",
      code: "XX000",
    });
    expect(typeof line.time).toBe("string");
  });

  it("redacts sensitive fields at any depth and never prints their values", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logger.info("test", {
      email: "a@example.com",
      nested: { contactPhone: "+91 98765 43210", accessToken: "tok", ok: 1 },
      apiKey: "sk-123",
    });
    const raw = String(spy.mock.calls[0]?.[0]);
    expect(raw).not.toMatch(/a@example\.com|98765|tok"|sk-123/);
    expect(JSON.parse(raw)).toMatchObject({
      email: "[redacted]",
      nested: { contactPhone: "[redacted]", accessToken: "[redacted]", ok: 1 },
      apiKey: "[redacted]",
    });
  });

  it("truncates long strings, deep objects and errors safely", () => {
    expect(redact("x".repeat(600))).toHaveLength(501);
    expect(redact({ a: { b: { c: { d: { e: 1 } } } } })).toEqual({
      a: { b: { c: { d: "[truncated]" } } },
    });
    expect(redact(new TypeError("boom"))).toEqual({ name: "TypeError", message: "boom" });
  });
});
