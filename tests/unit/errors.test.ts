import { describe, expect, it, vi } from "vitest";

import { AppError, ok, toFailure } from "@/lib/errors";

describe("AppError", () => {
  it("maps error codes to HTTP status", () => {
    expect(new AppError("FORBIDDEN", "Not allowed").httpStatus).toBe(403);
    expect(new AppError("CONFLICT", "Already booked").httpStatus).toBe(409);
  });
});

describe("toFailure", () => {
  it("preserves the code, message and field errors of an AppError", () => {
    const error = new AppError("VALIDATION_FAILED", "Check the form", {
      fieldErrors: { travelers: ["Must be at least 1"] },
    });

    expect(toFailure(error)).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Check the form",
        fieldErrors: { travelers: ["Must be at least 1"] },
      },
    });
  });

  it("hides internal details of unknown errors", () => {
    const failure = toFailure(new Error("relation bookings does not exist"));

    expect(failure.error.code).toBe("INTERNAL");
    expect(failure.error.message).not.toContain("bookings");
  });

  it("does not leak the AppError cause", () => {
    const failure = toFailure(
      new AppError("UPSTREAM_UNAVAILABLE", "Provider is unavailable", {
        cause: new Error("timeout contacting provider-api.internal"),
      }),
    );

    expect(JSON.stringify(failure)).not.toContain("provider-api.internal");
  });
});

describe("ok", () => {
  it("wraps data in a success result", () => {
    expect(ok({ id: "x" })).toEqual({ ok: true, data: { id: "x" } });
  });
});

describe("toLoggedFailure / summarizeForLog", () => {
  it("logs unexpected database errors without details or hints that may hold user data", async () => {
    const { toLoggedFailure, summarizeForLog } = await import("@/lib/errors");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const dbError = {
      code: "XX000",
      message: "internal error",
      details: "Key (contact_email)=(person@example.test) caused a problem",
      hint: "secret hint",
    };
    toLoggedFailure(
      "test.event",
      new AppError("INTERNAL", "Something went wrong.", { cause: dbError }),
    );
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).toContain("XX000");
    expect(logged).not.toContain("person@example.test");
    expect(logged).not.toContain("secret hint");
    expect(summarizeForLog("a string with data")).toEqual({ value: "string" });
    spy.mockRestore();
  });

  it("does not log expected failures", async () => {
    const { toLoggedFailure } = await import("@/lib/errors");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    toLoggedFailure("test.event", new AppError("FORBIDDEN", "No."));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
