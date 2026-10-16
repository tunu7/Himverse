---
paths:
  - "src/app/**/route.ts"
  - "src/features/**/actions.ts"
  - "src/features/**/schemas.ts"
  - "src/server/**"
  - "src/lib/errors.ts"
  - "src/lib/env*.ts"
---

# API, validation and error handling

Docs: docs/api/API_CONTRACTS.md.

- Treat every argument of a Server Action or Route Handler as `unknown`; parse with Zod `safeParse` first.
- Bound everything: string lengths, array sizes, numeric ranges. Prefer `z.strictObject` for inputs.
- Validation failures → `AppError("VALIDATION_FAILED", msg, { fieldErrors: z.flattenError(e).fieldErrors })`.
- Server Actions return `ActionResult<T>` via `ok()` / `toFailure()`; don't throw expected failures to the client.
- Route Handlers respond `{ data }` or `{ error: { code, message, fieldErrors? } }` with `AppError.httpStatus`.
- Never return raw DB errors, stack traces or provider responses to clients — put them in `cause` and log.
- Validate AI output with a Zod schema and run grounding checks before persisting or displaying it.
- External calls: timeouts; retries only for idempotent operations; failures → `UPSTREAM_UNAVAILABLE`.
- User-controlled sort/filter fields must go through an allow-list.
