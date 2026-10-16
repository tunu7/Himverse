# API contracts, validation and errors

Code: `src/lib/errors.ts` (`AppError`, `ActionResult`, `ok`, `toFailure`, `toLoggedFailure`) and
`src/lib/validation.ts` (`parseInput`).

## Choosing the interface

| Need | Use |
| --- | --- |
| Reads for pages | Server Components calling `src/server` |
| Mutations from our UI | Server Actions in `src/features/<f>/actions.ts` |
| Webhooks, cron, auth callbacks, machine clients | Route Handlers in `src/app/**/route.ts` |

Route Handlers today:

- `api/health`;
- `api/webhooks/razorpay`;
- `api/cron/payments` (bearer `CRON_SECRET`);
- `auth/{callback,confirm,google,reset}`.

## Server Actions

They are public HTTP endpoints, so treat every argument as untrusted.

1. **Validate:** `parseInput(schema, formData)`, with a `z.strictObject` from the feature's `schemas.ts`.
2. **Authenticate and authorise:** `requireAccount([...])`, `requireAdmin()`, or the `src/server`
   function does it.
3. **Execute** through `src/server/<domain>`. The database re-checks ownership and transitions.
4. **Return** `ok(data)` or `toLoggedFailure("<feature>.<action>_failed", error)`. Then call
   `refresh()` after mutations.

Return only what the UI needs, never raw rows. Mutating booking and payment operations take an
idempotency key and are safe to retry ([DATA_ACCESS_PATTERNS](../database/DATA_ACCESS_PATTERNS.md)). A
response never says "confirmed" or "paid" unless the stored state says so.

## Route Handlers

- **Responses:** JSON. Success is `{ "data": ... }`. Errors use `AppError.httpStatus` with
  `{ "error": { "code", "message", "fieldErrors"? } }`.
- **Webhooks:**
  - check the size limit;
  - verify the signature on the **raw body** before parsing;
  - deduplicate by event id;
  - process idempotently;
  - send `2xx` only once the event is stored or recognised.
- **Cron:** a bearer secret, compared in constant time; fail closed when it isn't set.

## Validation (Zod 4)

| Source | Where validated |
| --- | --- |
| Form data / Server Action args | First lines of the action (feature schema) |
| Route params, `searchParams` | In the page/route before use |
| Webhook bodies | After signature verification |
| Environment variables | `src/lib/env.ts`, `src/lib/env.server.ts` |
| AI output | `src/server/itineraries/` before saving or showing |
| External API responses (Razorpay) | In the adapter (`src/server/payments/razorpay.ts`) |

- Use one schema for the form hints and the action. Client-side validation is UX only.
- Be strict: use `z.strictObject` and bound every string, array and number.
- Use `z.coerce` for form fields only, never for JSON bodies.
- User-controlled sort or filter values go through an allow-list. Never put them into `.order()`,
  column lists or SQL directly.
- Typed Supabase rows are trusted for shape. JSON columns whose schema can change are re-validated on
  read.

## Errors

1. **Expected failures are values.** Actions return `ActionResult`; they don't throw for validation,
   authorisation or conflict cases.
2. **Clients get stable codes and safe messages.** SQL errors, stacks and provider responses go to the
   logs as `cause`.
3. **Fail closed.** If authorisation can't be determined, deny.
4. **No silent catches.** Handle the error, convert it to `AppError`, or rethrow it.

| Code | HTTP | Use when |
| --- | --- | --- |
| `VALIDATION_FAILED` | 400 | Input failed Zod (include `fieldErrors`) |
| `UNAUTHENTICATED` | 401 | No valid session |
| `FORBIDDEN` | 403 | Signed in but not allowed |
| `NOT_FOUND` | 404 | Missing **or** not visible to the caller (don't leak existence) |
| `CONFLICT` | 409 | State conflict (already confirmed, slot taken, deposit not due) |
| `RATE_LIMITED` | 429 | Throttled (DB limits raise `54000`) |
| `UPSTREAM_UNAVAILABLE` | 503 | AI, Razorpay or other dependency failed |
| `INTERNAL` | 500 | Anything unexpected (generic message) |

Database SQLSTATEs map to these codes in `src/lib/supabase/errors.ts`.

External calls (AI, Razorpay) have timeouts, retry only when the operation is idempotent, and map
failures to `UPSTREAM_UNAVAILABLE`. Pages render `fieldErrors` next to inputs, and route segments have
`error.tsx` or `not-found.tsx` where useful.

## Public discovery URLs

Shareable GET URLs, parsed in `src/features/discovery/search-params.ts`. Invalid values are dropped per
field and reported to the user.

| Route | Parameters |
| --- | --- |
| `/experiences`, `/stays`, `/guides`, `/transport` | `q` (≤ 100), `district`, `category`, `budget` (`under-1000`, `1000-3000`, `3000-10000`, `10000-plus`), `duration` (`under-3h`, `half-day`, `full-day`, `multi-day`), `sort` (`newest`, `price-asc`, `price-desc`, `duration`, `title`), `page` (1–50) |
| `/destinations` | `q`, `district`, `page` |
