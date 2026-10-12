# Error Handling

Implementation: `src/lib/errors.ts` (`AppError`, `ActionResult`, `ok`, `toFailure`).

## Principles

1. **Expected failures are values, unexpected failures are exceptions.** Server Actions return
   `ActionResult<T>`; they don't throw for validation, auth or conflict cases.
2. **Clients see stable codes and safe messages only.** Internal details (SQL errors, stack traces,
   provider responses) go to logs via `cause`, never into responses.
3. **Fail closed.** If authorization can't be determined, deny.
4. **No silent catches.** Every `catch` either handles, converts to `AppError`, or rethrows.

## Error codes

| Code                   | HTTP | Use when                                                     |
| ---------------------- | ---- | ------------------------------------------------------------ |
| `VALIDATION_FAILED`    | 400  | Input failed Zod validation (include `fieldErrors`)          |
| `UNAUTHENTICATED`      | 401  | No valid session                                             |
| `FORBIDDEN`            | 403  | Authenticated but not allowed                                |
| `NOT_FOUND`            | 404  | Resource missing _or_ not visible to the caller (don't leak) |
| `CONFLICT`             | 409  | State conflict, e.g. booking already confirmed, slot taken   |
| `RATE_LIMITED`         | 429  | Throttled (e.g. AI generation limits)                        |
| `UPSTREAM_UNAVAILABLE` | 503  | AI/payment/provider dependency failed                        |
| `INTERNAL`             | 500  | Anything unexpected — generic message                        |

## Patterns

```ts
"use server";
export async function requestBooking(input: unknown): Promise<ActionResult<BookingSummary>> {
  try {
    const parsed = requestBookingSchema.safeParse(input);
    if (!parsed.success) {
      throw new AppError("VALIDATION_FAILED", "Please check the highlighted fields.", {
        fieldErrors: z.flattenError(parsed.error).fieldErrors,
      });
    }
    return ok(await bookingsService.request(parsed.data));
  } catch (error) {
    // log with request context (see OBSERVABILITY.md), then:
    return toFailure(error);
  }
}
```

- Route Handlers map `AppError.httpStatus` to the response status with the same `{ error: { code, message } }` body.
- Route segments provide `error.tsx` (recoverable UI with retry) and `not-found.tsx` where meaningful.
- UI renders `fieldErrors` next to inputs and a summary for other codes.

## External dependencies

AI and provider calls have timeouts, bounded retries with backoff only for idempotent operations, and
map failures to `UPSTREAM_UNAVAILABLE`. Booking/payment operations are never retried without an
idempotency key.
