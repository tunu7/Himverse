import { describe, expect, it } from "vitest";

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
