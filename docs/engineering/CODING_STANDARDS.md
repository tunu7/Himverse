# Coding Standards

Enforced by TypeScript (`strict`, `noUncheckedIndexedAccess`), ESLint, Prettier and review.
Path-scoped versions of these rules for Claude Code live in `.claude/rules/`.

## TypeScript

- No `any`. Use `unknown` and narrow. If `any` is truly needed (third-party typing gap), add
  `// eslint-disable-next-line @typescript-eslint/no-explicit-any -- <reason>`.
- No non-null assertions (`!`) on external data; validate instead.
- Derive types from Zod schemas (`z.infer`) and from generated Supabase types; don't hand-duplicate them.
- Prefer discriminated unions for state (`{ status: "pending" } | { status: "confirmed"; confirmedAt }`).
- Use `import type` for type-only imports. Use the `@/` alias for anything under `src/`.
- Exported functions in `src/server` and `src/lib` have explicit return types when non-trivial.

## Naming

- Files: `kebab-case.ts`; React components: `PascalCase` exports in `kebab-case.tsx` files.
- Functions: verbs (`createBookingRequest`); booleans: `is/has/can` prefixes.
- Database: `snake_case` tables (plural) and columns; see [DATABASE_DESIGN](../database/DATABASE_DESIGN.md).

## React and Next.js

- Server Components by default; add `"use client"` only for interactivity, at the smallest leaf.
- Never import `src/server/**`, `src/lib/env.server.ts` or `src/lib/supabase/server.ts` into client code
  (they import `server-only`, so the build fails if you do).
- Request-time data (cookies, headers, session) renders inside `<Suspense>` (Cache Components).
- Every data-driven view handles loading, empty, success and error states.
- Server Actions: validate input → authenticate → authorize → call `src/server` → return `ActionResult`.

## Functions and modules

- Small, single-purpose functions; pure where possible so they are unit-testable.
- No speculative abstractions: add a generic helper on the third real use, not the first.
- No barrel files (`index.ts` re-exports) in `src/server` — they obscure server/client boundaries.

## Comments

Explain _why_, not _what_. Document invariants, security assumptions and non-obvious trade-offs.

## Dependencies

Before adding a package: check it is maintained, typed, licence-compatible and not replaceable by a few
lines of code or the platform. Architecture-shaping dependencies need an ADR.
