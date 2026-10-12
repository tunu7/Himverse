---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---

# TypeScript rules

Full standard: docs/engineering/CODING_STANDARDS.md.

- `strict` and `noUncheckedIndexedAccess` are on: handle `undefined` from indexing; don't silence with `!`.
- No `any`. Use `unknown` + narrowing or Zod. A justified `any` needs an eslint-disable comment with the reason.
- Derive types from Zod (`z.infer`) and generated Supabase types; don't duplicate shapes by hand.
- Model state with discriminated unions; make impossible states unrepresentable.
- `import type` for type-only imports; `@/` alias for `src/` imports.
- No barrel `index.ts` files in `src/server`.
- No speculative abstractions or unused exports. Comments explain why, not what.
