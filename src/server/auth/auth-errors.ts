import { AppError } from "@/lib/errors";

/** The parts of a supabase-js AuthError we branch on. */
export type AuthErrorLike = {
  code?: string | undefined;
  status?: number | undefined;
  name?: string;
};

function isRateLimited(error: AuthErrorLike): boolean {
  return error.status === 429 || (error.code?.startsWith("over_") ?? false);
}

function isUpstreamFailure(error: AuthErrorLike): boolean {
  return error.name === "AuthRetryableFetchError" || (error.status ?? 0) >= 500;
}

const RATE_LIMITED = "Too many attempts. Please wait a few minutes and try again.";
const UNAVAILABLE = "We can't reach the sign-in service right now. Please try again shortly.";

/**
 * Sign-in failures. Wrong email and wrong password share one message so the
 * form can't be used to discover accounts; infrastructure failures are
 * reported (and logged) as such instead of looking like a wrong password.
 */
export function signInError(error: AuthErrorLike): AppError {
  if (isRateLimited(error)) {
    return new AppError("RATE_LIMITED", RATE_LIMITED, { cause: error });
  }
  if (isUpstreamFailure(error)) {
    return new AppError("UPSTREAM_UNAVAILABLE", UNAVAILABLE, { cause: error });
  }
  if (error.code === "email_not_confirmed") {
    // Supabase returns this only after the password has been verified.
    return new AppError(
      "UNAUTHENTICATED",
      "Please confirm your email address first. Check your inbox for the link.",
      { cause: error },
    );
  }
  return new AppError("UNAUTHENTICATED", "Email or password is incorrect.", { cause: error });
}

/** Sign-up failures. Never reveals whether an email is already registered. */
export function signUpError(error: AuthErrorLike): AppError {
  if (isRateLimited(error)) {
    return new AppError("RATE_LIMITED", RATE_LIMITED, { cause: error });
  }
  if (isUpstreamFailure(error)) {
    return new AppError("UPSTREAM_UNAVAILABLE", UNAVAILABLE, { cause: error });
  }
  if (error.code === "weak_password") {
    return new AppError("VALIDATION_FAILED", "Please choose a stronger password.", {
      cause: error,
      fieldErrors: { password: ["Password is too weak."] },
    });
  }
  if (error.code === "signup_disabled") {
    return new AppError("FORBIDDEN", "New sign-ups are currently closed.", { cause: error });
  }
  return new AppError(
    "VALIDATION_FAILED",
    "We couldn't create an account with those details. If you already have an account, sign in instead.",
    { cause: error },
  );
}
