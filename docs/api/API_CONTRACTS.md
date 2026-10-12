# API Contracts

No endpoints exist yet. This defines the conventions every endpoint must follow.

## Choosing the interface

| Need                                     | Use                                             |
| ---------------------------------------- | ----------------------------------------------- |
| Reads for pages                          | Server Components calling `src/server`          |
| Mutations from our UI                    | Server Actions in `src/features/<f>/actions.ts` |
| Webhooks, third-party or machine clients | Route Handlers in `src/app/api/<area>/route.ts` |

Server Actions are public HTTP endpoints: treat their arguments as untrusted, exactly like a route handler.

## Server Action contract

- Signature: `(input: unknown) => Promise<ActionResult<T>>` (or `(prev, formData)` for `useActionState`).
- Order: validate (Zod) → authenticate → authorize → execute via `src/server` → return `ok(data)` or
  `toFailure(error)` ([ERROR_HANDLING](../engineering/ERROR_HANDLING.md)).
- Return only data the UI needs; never raw DB rows with internal columns.
- After mutations, invalidate cache tags for affected public data.

## Route Handler contract

- JSON request/response; `Content-Type: application/json`.
- Success: `200/201` with `{ "data": ... }`.
- Error: status from `AppError.httpStatus`, body `{ "error": { "code": "...", "message": "...", "fieldErrors"?: {...} } }`.
- Webhooks: verify signature on the raw body **before** parsing; respond `2xx` only after durable,
  idempotent processing.
- Version machine-facing APIs in the path (`/api/v1/...`) when external clients exist.

## Mutating booking/payment operations

Must accept an idempotency key and be safe to retry ([DATA_ACCESS_PATTERNS](../database/DATA_ACCESS_PATTERNS.md#idempotency-bookings-payments)).
Responses must never state "confirmed" unless the stored booking status is `confirmed`.

## Public discovery URLs (implemented, Phase 2)

Shareable GET URLs; parsing lives in `src/features/discovery/search-params.ts`, and invalid values are
dropped per field and reported to the user.

| Route           | Parameters                                                                                                                                                                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/experiences`  | `q` (≤100 chars), `district`, `category` (enum), `budget` (`under-1000`, `1000-3000`, `3000-10000`, `10000-plus`), `duration` (`under-3h`, `half-day`, `full-day`, `multi-day`), `sort` (`newest`, `price-asc`, `price-desc`, `duration`, `title`), `page` (1–50) |
| `/destinations` | `q`, `district`, `page`                                                                                                                                                                                                                                           |

## Planned contracts (to be specified in their phase)

`itineraries.generate`, `itineraries.refine`, `bookings.request`,
`bookings.respond` (provider), `admin.verifyProvider`.
