# Validation

All untrusted input is validated with **Zod 4** at the boundary where it enters the system.

## Boundaries

| Source                         | Where validated                                         |
| ------------------------------ | ------------------------------------------------------- |
| Form data / Server Action args | First lines of the action, with the feature schema      |
| Route params, `searchParams`   | In the page/route before use                            |
| Route Handler bodies, webhooks | After signature verification                            |
| Environment variables          | `src/lib/env.ts`, `src/lib/env.server.ts`               |
| AI model output                | `src/server/itineraries/` before persistence or display |
| Data from external providers   | At the integration adapter                              |

Database rows read via the typed Supabase client are trusted for shape (RLS and constraints guard them);
JSON columns are re-validated when read if their schema can evolve.

## Practices

- Use `safeParse` at boundaries and convert failures to `AppError("VALIDATION_FAILED", ..., { fieldErrors })`
  using `z.flattenError(error).fieldErrors`.
- Share one schema between the form (client-side hints) and the action (authoritative check). Client-side
  validation is UX only.
- Be strict: `z.strictObject` for inputs where unknown keys indicate a bug or tampering; bound string
  lengths, array sizes and numeric ranges (e.g. group size 1–20, duration 1–30 days).
- Coerce deliberately: `z.coerce.number()` for form fields, never for JSON bodies.
- Never pass user-controlled values into `.order()`, column lists, or raw SQL without an allow-list.
- Infer types from schemas: `type RequestBookingInput = z.infer<typeof requestBookingSchema>`.
