---
name: verify
description: Run Himverse.AI quality gates (format, lint, typecheck, unit tests, build, and when relevant E2E and database tests) and report exact results. Use before declaring any task complete or when asked to check, test, or verify changes.
---

# Verify

Run checks and report **only what actually ran**, with real results.

1. Core gate (always): `npm run verify`
   (= `format:check` → `lint` → `typecheck` → `test` → `build`, stops at first failure).
   If it fails, run the failing step alone to see full output, fix the cause, re-run the whole gate.
   If `format:check` fails on files you changed, run `npm run format` and re-check.
2. E2E (when UI, routing, auth or critical flows changed): `npm run test:e2e` after the build.
   First run on a machine may need `npx playwright install chromium`.
3. Database (when `supabase/` changed): `npm run db:test` (needs Docker + `npx supabase start`).
4. Docs changed: check every relative markdown link resolves.

## Reporting

Produce a table: command → pass / fail / not run (+ reason) → key output (test counts, error excerpt).
Never write "passed" for a command you did not run in this session. Never `.skip` tests, add
`eslint-disable` without justification, loosen `tsconfig`, or weaken RLS to get green — report the
blocker instead.
