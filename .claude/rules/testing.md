---
paths:
  - "tests/**"
  - "supabase/tests/**"
  - "vitest.config.mts"
  - "playwright.config.ts"
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "**/*.spec.ts"
---

# Testing rules

Strategy: docs/engineering/TESTING_STRATEGY.md. Use the `/verify` skill to run checks.

- Unit tests (Vitest) in `tests/unit/`, integration in `tests/integration/`, E2E (Playwright) in
  `tests/e2e/`, RLS/DB tests (pgTAP) in `supabase/tests/`.
- Test behaviour, including failure paths: invalid input, unauthenticated, wrong user/role, conflicts.
- Every RLS policy: tests proving allowed access and denied access for other users and roles.
- No real network or AI calls in unit/integration tests; mock at the adapter boundary.
- Async Server Components are tested with Playwright, not Vitest.
- Never `.skip`, `.only`, delete, or loosen a failing test to get green. Fix the code or report the failure.
- E2E runs against `next start` on port 3100 after `npm run build`.
