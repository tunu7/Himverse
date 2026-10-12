import { AppError } from "@/lib/errors";

/** Minimal shape of PostgREST / Postgres errors returned by supabase-js. */
export type DatabaseErrorLike = { code?: string | null; message?: string | null };

/**
 * Maps database errors to client-safe AppErrors. SQLSTATEs raised by our
 * lifecycle functions are documented in
 * supabase/migrations/20261012131030_providers.sql. The original error is kept
 * as `cause` for logging and never returned to clients.
 */
export function toAppError(error: DatabaseErrorLike, fallbackMessage: string): AppError {
  switch (error.code) {
    case "42501": // insufficient_privilege, incl. RLS "new row violates row-level security policy"
      return new AppError("FORBIDDEN", "You don't have permission to do that.", { cause: error });
    case "P0002": // no_data_found
    case "PGRST116": // .single() found no row (or it is not visible)
      return new AppError("NOT_FOUND", "We couldn't find that.", { cause: error });
    case "55000": // invalid lifecycle transition
      return new AppError("CONFLICT", "That action isn't available in the current status.", {
        cause: error,
      });
    case "23505": // unique_violation
      return new AppError("CONFLICT", "That identifier is already taken. Please choose another.", {
        cause: error,
      });
    case "22023": // invalid_parameter_value
    case "23514": // check_violation
    case "23502": // not_null_violation
      return new AppError("VALIDATION_FAILED", "Some of the information isn't valid.", {
        cause: error,
      });
    case "23503": // foreign_key_violation
      return new AppError("VALIDATION_FAILED", "A referenced item doesn't exist.", {
        cause: error,
      });
    default:
      return new AppError("INTERNAL", fallbackMessage, { cause: error });
  }
}
