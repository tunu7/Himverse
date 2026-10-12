---
name: production-review
description: Review a Himverse.AI change (current diff, branch, or named files) for production readiness — correctness, security and RLS, data integrity, booking idempotency, AI output handling, UX states, tests, performance, and documentation. Use before opening or merging a PR or when asked for a code review.
---

# Production review

1. Determine scope: `git diff main...HEAD` plus `git status` for uncommitted work (or files the user names).
2. Delegate an independent security pass to the `security-reviewer` agent (pass it the changed-file list
   and diff) for any change touching
   `src/server`, `src/features/**/actions.ts`, route handlers, `supabase/`, env, or auth.
3. Review the diff yourself against:
   - **Correctness:** acceptance criteria met; edge cases; error paths return `ActionResult` failures.
   - **Architecture:** placement per docs/architecture/PROJECT_STRUCTURE.md; downward-only imports; no
     server modules imported by client code; no speculative abstractions or unneeded dependencies.
   - **Security:** Zod at boundaries; authn/authz in every action/handler; RLS + tests for new tables;
     secrets server-only; no PII/secrets in logs.
   - **Data integrity:** migrations backward compatible; booking/payment ops idempotent; DB-enforced transitions.
   - **AI:** output validated and grounded; stored apart from curated data; never presented as availability
     or confirmation; rendered as text.
   - **UX:** loading, empty, success, error states; accessibility basics; Suspense around request-time data.
   - **Tests:** meaningful coverage of logic, auth boundaries, critical journeys; no skipped tests.
   - **Performance:** no N+1 queries; explicit column selection; caching only for non-user-specific data.
   - **Docs:** affected docs/ADRs updated; task report present for significant work.
4. Report findings ranked by severity (blocker / should-fix / nit) with `file:line`, the concrete failure
   scenario, and a suggested fix. State clearly if nothing blocking was found. Don't apply fixes unless asked.
