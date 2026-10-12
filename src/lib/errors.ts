/**
 * Application error contract. See docs/engineering/ERROR_HANDLING.md.
 *
 * `AppError` carries a stable machine-readable `code` and a user-safe
 * `message`. Internal details go in `cause` and are logged, never returned to
 * clients.
 */

export const ERROR_CODES = [
  "VALIDATION_FAILED",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "UPSTREAM_UNAVAILABLE",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  UPSTREAM_UNAVAILABLE: 503,
  INTERNAL: 500,
};

export type FieldErrors = Readonly<Record<string, readonly string[]>>;

export class AppError extends Error {
  override readonly name = "AppError";
  readonly code: ErrorCode;
  readonly fieldErrors: FieldErrors | undefined;

  constructor(
    code: ErrorCode,
    message: string,
    options?: { cause?: unknown; fieldErrors?: FieldErrors },
  ) {
    super(message, { cause: options?.cause });
    this.code = code;
    this.fieldErrors = options?.fieldErrors;
  }

  get httpStatus(): number {
    return HTTP_STATUS[this.code];
  }
}

/** Shape returned to clients by server actions and route handlers. */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; fieldErrors?: FieldErrors } };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

/**
 * Converts any thrown value into a client-safe failure. Unknown errors are
 * reported as INTERNAL with a generic message so internals never leak.
 */
export function toFailure(error: unknown): Extract<ActionResult<never>, { ok: false }> {
  if (error instanceof AppError) {
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
      },
    };
  }
  return {
    ok: false,
    error: { code: "INTERNAL", message: "Something went wrong. Please try again." },
  };
}
