import { describe, expect, it } from "vitest";

import { signInError, signUpError } from "@/server/auth/auth-errors";

describe("signInError", () => {
  it("gives the same answer for any credential failure (no account discovery)", () => {
    const unknownEmail = signInError({ code: "invalid_credentials", status: 400 });
    const wrongPassword = signInError({ code: "invalid_credentials", status: 400 });
    const unknownCode = signInError({ code: "something_new", status: 400 });
    for (const e of [unknownEmail, wrongPassword, unknownCode]) {
      expect(e).toMatchObject({
        code: "UNAUTHENTICATED",
        message: "Email or password is incorrect.",
      });
    }
  });

  it("reports rate limiting instead of a wrong password", () => {
    expect(signInError({ code: "over_request_rate_limit", status: 429 }).code).toBe("RATE_LIMITED");
    expect(signInError({ status: 429 }).code).toBe("RATE_LIMITED");
  });

  it("reports outages as UPSTREAM_UNAVAILABLE so they are logged", () => {
    expect(signInError({ name: "AuthRetryableFetchError", status: 0 }).code).toBe(
      "UPSTREAM_UNAVAILABLE",
    );
    expect(signInError({ code: "unexpected_failure", status: 500 }).code).toBe(
      "UPSTREAM_UNAVAILABLE",
    );
  });

  it("explains an unconfirmed email", () => {
    expect(signInError({ code: "email_not_confirmed", status: 400 }).message).toMatch(
      /confirm your email/,
    );
  });
});

describe("signUpError", () => {
  it("never reveals that an email is registered", () => {
    for (const code of ["user_already_exists", "email_exists"]) {
      expect(signUpError({ code, status: 422 })).toMatchObject({
        code: "VALIDATION_FAILED",
        message: expect.stringContaining("If you already have an account"),
      });
    }
  });

  it("flags weak passwords on the password field", () => {
    expect(signUpError({ code: "weak_password", status: 422 }).fieldErrors).toEqual({
      password: ["Password is too weak."],
    });
  });

  it("maps rate limits, outages and closed sign-ups", () => {
    expect(signUpError({ code: "over_email_send_rate_limit", status: 429 }).code).toBe(
      "RATE_LIMITED",
    );
    expect(signUpError({ name: "AuthRetryableFetchError" }).code).toBe("UPSTREAM_UNAVAILABLE");
    expect(signUpError({ code: "signup_disabled", status: 422 }).code).toBe("FORBIDDEN");
  });
});
