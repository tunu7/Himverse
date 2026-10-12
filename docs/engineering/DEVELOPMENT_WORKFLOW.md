# Development Workflow

Applies to every feature, fix and refactor — by humans and AI agents alike.

## The 10 steps

1. **Inspect** the repository and existing implementation. Read the relevant docs and code before deciding.
2. **Clarify** the requirement and write acceptance criteria. Check against [MVP_SCOPE](../product/MVP_SCOPE.md).
3. **Identify impact:** modules, routes, Server Actions, tables, RLS policies, security boundaries,
   environment variables, dependencies.
4. **Plan** the implementation and list risks (security, data migration, performance, UX states).
5. **Implement the smallest complete change** — complete means validated, authorized, tested and with all UI
   states; small means no unrelated refactors.
6. **Test:** add/update unit tests for logic, pgTAP tests for RLS/constraints, E2E for critical journeys
   ([TESTING_STRATEGY](TESTING_STRATEGY.md)).
7. **Verify:** `npm run verify`; plus `npm run test:e2e` and `npm run db:test` when affected.
8. **Review** security, regressions, maintainability and performance (Claude Code: `/production-review`).
9. **Document:** update affected docs; write an ADR for significant decisions.
10. **Report:** write `reports/tasks/YYYY-MM-DD-<slug>.md` from [TASK_REPORT_TEMPLATE](TASK_REPORT_TEMPLATE.md).

## Honesty rules

- Never claim a check passed unless it ran in this session and passed. Record exact commands and results.
- Never disable a test, skip a check or loosen RLS to get a green build. Fix the cause or report the blocker.
- Never claim deployment, external integration or production readiness without evidence.

## Branching and PRs

Short-lived branches from `main`; PRs require green CI and review ([CONTRIBUTING](../../CONTRIBUTING.md)).
Database migrations ship in the same PR as the code that needs them.

## Database changes

`npx supabase migration new <name>` → write SQL with RLS → pgTAP tests in `supabase/tests/` →
`npx supabase db reset` locally → `npm run db:test`. Details: [DATABASE_DESIGN](../database/DATABASE_DESIGN.md).

## Claude Code configuration

| Path                        | Purpose                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md`                 | Entry point; imports `AGENTS.md` (Next.js-managed block)                                                                                                                                                                                                                                                                                                             |
| `.claude/settings.json`     | Shared permissions: allows project checks and read-only git (exact `git diff`/`git branch` forms only); denies reading real env files, `supabase status`, `git diff --no-index`, remote DB push/link/secrets, force-push, branch force-delete and deploys. Deny rules are prefix matches, so unusual argument orders fall back to a prompt rather than being blocked |
| `.claude/rules/*.md`        | Path-scoped rules (`paths:` frontmatter) loaded when matching files are touched                                                                                                                                                                                                                                                                                      |
| `.claude/skills/*/SKILL.md` | `implement-feature`, `db-migration-rls`, `verify`, `production-review`                                                                                                                                                                                                                                                                                               |
| `.claude/agents/`           | `security-reviewer` — read-only independent security pass                                                                                                                                                                                                                                                                                                            |

Personal overrides go in `.claude/settings.local.json` (gitignored).

**No hooks yet, deliberately.** Quality gates run via `npm run verify` and CI; a hook that runs them on
every edit would be slow and duplicate CI. Add a hook only for a concrete, repeated failure that rules and
CI don't catch.
