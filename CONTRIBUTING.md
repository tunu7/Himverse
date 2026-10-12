# Contributing to Himverse.AI

## Workflow summary

1. Pick or create an issue with clear acceptance criteria.
2. Branch from `main`: `feat/<slug>`, `fix/<slug>`, `chore/<slug>`, `docs/<slug>`.
3. Follow the [development workflow](docs/engineering/DEVELOPMENT_WORKFLOW.md): plan, smallest complete
   change, tests, verification, documentation.
4. Run `npm run verify` locally (and `npm run test:e2e` / `npm run db:test` when relevant).
5. Write a task report for significant work in `reports/tasks/` using the
   [template](docs/engineering/TASK_REPORT_TEMPLATE.md).
6. Open a pull request. CI must be green; at least one review is required before merge.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat(catalog): list experiences by region`.
Keep commits focused. Never commit `.env*` files (other than `.env.example`), credentials, generated
keys, or unrelated changes.

## Pull request checklist

- [ ] Acceptance criteria met and described in the PR
- [ ] Tests added/updated for business logic, authorization boundaries and critical journeys
- [ ] `npm run verify` passes locally; E2E/DB tests run when affected
- [ ] New/changed tables have RLS enabled and pgTAP policy tests ([AUTHORIZATION_AND_RLS](docs/security/AUTHORIZATION_AND_RLS.md))
- [ ] Untrusted input validated with Zod ([VALIDATION](docs/api/VALIDATION.md))
- [ ] No secrets in client code; no new `NEXT_PUBLIC_` variable holds a secret
- [ ] Docs and ADRs updated; task report written for significant work
- [ ] Migration and rollout notes included if the change needs manual steps

## Coding standards

See [CODING_STANDARDS](docs/engineering/CODING_STANDARDS.md) and [TESTING_STRATEGY](docs/engineering/TESTING_STRATEGY.md).

## Architecture decisions

Significant technical decisions (new dependency of note, new service, data model shape, auth model
changes, AI provider choice) require an ADR in [docs/decisions](docs/decisions/README.md).

## Security issues

Do not open public issues for vulnerabilities. Follow [SECURITY](docs/security/SECURITY.md).
