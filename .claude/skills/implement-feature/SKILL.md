---
name: implement-feature
description: Implement a Himverse.AI feature or fix end-to-end following the project's 10-step workflow — inspect, acceptance criteria, impact analysis, plan, smallest complete change, tests, verification, review, docs, task report. Use when asked to build, add, or change product functionality.
---

# Implement a feature

Follow docs/engineering/DEVELOPMENT_WORKFLOW.md. Concretely:

1. **Inspect.** Read CLAUDE.md, docs/product/MVP_SCOPE.md, the relevant docs, and the existing code in
   `src/app`, `src/features/<feature>`, `src/server/<domain>`, `supabase/migrations`. Check
   `node_modules/next/dist/docs/` for any Next.js API you'll use.
2. **Clarify.** Write acceptance criteria. If the request is outside MVP scope or ambiguous on a decision
   that matters (data model, auth, money, AI behaviour), ask before building.
3. **Impact.** List affected routes, components, Server Actions, server modules, tables, RLS policies,
   env vars, dependencies, and security boundaries.
4. **Plan + risks.** Present the plan and risks; wait for approval when the change touches schema,
   auth, bookings/payments, or adds a dependency.
5. **Implement the smallest complete change**, respecting placement in docs/architecture/PROJECT_STRUCTURE.md:
   - Schema → use the `db-migration-rls` skill.
   - Input schema in `src/features/<f>/schemas.ts`; Server Action in `actions.ts` (validate → auth →
     authorize → `src/server` → `ActionResult`).
   - Queries/business rules in `src/server/<domain>/` with `import "server-only"`.
   - UI with loading, empty, success, error states.
6. **Tests.** Unit tests for logic and failure paths; pgTAP for RLS; Playwright for critical journeys.
7. **Verify.** Use the `verify` skill. Fix failures; never skip or weaken tests.
8. **Review.** Use the `production-review` skill on the diff.
9. **Docs.** Update affected docs; add an ADR for significant decisions.
10. **Report.** Write `reports/tasks/YYYY-MM-DD-<slug>.md` from docs/engineering/TASK_REPORT_TEMPLATE.md with
    real command results, then summarise to the user.
