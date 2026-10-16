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

## Branches, commits and PRs

- **Branches:** short-lived, from `main`: `feat/<slug>`, `fix/<slug>`, `chore/<slug>`, `docs/<slug>`.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/), for example
  `feat(catalog): list experiences by region`. Keep commits focused. Never commit `.env*` files
  (except `.env.example`), credentials or unrelated changes.
- **Migrations:** ship in the same PR as the code that needs them, and are applied to production
  **before** that code is pushed to `main` ([ENVIRONMENTS](../operations/ENVIRONMENTS.md#migrations)).
- **Before pushing to `main`:** also run what only CI runs:
  - `npm run test:integration`;
  - the types-drift check (`npm run db:types` and an unchanged `git diff`);
  - a build with no env file.
- **PR checklist:**
  - [ ] Acceptance criteria met and described.
  - [ ] Tests cover logic, authorisation boundaries and critical journeys.
  - [ ] `npm run verify` passes, plus E2E and DB tests when affected.
  - [ ] New tables have RLS and pgTAP tests, and the privileges snapshot is updated.
  - [ ] Untrusted input is validated with Zod ([API_CONTRACTS](../api/API_CONTRACTS.md)).
  - [ ] No secrets in client code or `NEXT_PUBLIC_` variables.
  - [ ] Docs and ADRs updated; a task report for significant work.
  - [ ] Migration and rollout notes if manual steps are needed.

Vulnerabilities are reported privately, never in public issues ([SECURITY](../security/SECURITY.md)).

## Database changes

`npx supabase migration new <name>` → write SQL with RLS → pgTAP tests in `supabase/tests/` →
`npx supabase db reset` locally → `npm run db:test`. Details: [DATABASE_DESIGN](../database/DATABASE_DESIGN.md).

## Claude Code configuration

| Path | Purpose |
| --- | --- |
| `CLAUDE.md` | Entry point; imports `AGENTS.md` (Next.js-managed block) |
| `.claude/settings.json` | Shared permissions. **Allows** project checks and read-only git. **Denies** reading env files, `supabase status`, `git diff --no-index`, remote DB push/link/secrets, force-push and deploys. Deny rules are prefix matches |
| `.claude/rules/*.md` | Path-scoped rules (`paths:` frontmatter), loaded when matching files are touched |
| `.claude/skills/*/SKILL.md` | `implement-feature`, `db-migration-rls`, `verify`, `production-review` |
| `.claude/agents/` | `security-reviewer`: a read-only independent security pass |

Personal overrides go in `.claude/settings.local.json` (gitignored).

**No hooks yet, deliberately.** Quality gates run via `npm run verify` and CI; a hook that runs them on
every edit would be slow and duplicate CI. Add a hook only for a concrete, repeated failure that rules and
CI don't catch.
