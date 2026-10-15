# Task Report: Align CLAUDE.md and docs with the MVP scope

- Date: 2026-10-15
- Author: Claude Code (agent)
- Branch / commit: main / uncommitted (base 199e79b)

## Objective and scope

The owner asked to optimize `CLAUDE.md` and the docs it links to so they match the project's scope.
Two decisions were confirmed with the owner before editing:

- The 2026-10-15 owner decisions are **in MVP scope, marked _(planned)_**:
  - one role per account, enforced in the database;
  - password reset and change, and resend confirmation;
  - TOTP 2-step sign-in for admins and partners;
  - listing types for guides, accommodation and transport.
- **Deployment state:** production is live on Vercel with a Supabase production project. There is no
  staging project yet.

Acceptance criteria:

- `MVP_SCOPE.md` states clearly what is built and what is planned.
- No doc contradicts it or describes the current state wrongly, for example "not deployed", "none are
  implemented", or an AI provider of "TBD".
- `CLAUDE.md` is a concise entry point that points to the right doc for each task.
- All relative links resolve, and formatting passes.

Out of scope:

- Code, schema and test changes.
- New ADRs (listed below as follow-ups).
- Accepted ADRs, which can't be edited.

## Summary of implementation

**`CLAUDE.md`** now has:

- a scope-first statement;
- a "Current state" section (built / planned next / not in MVP);
- a "Roles and terms" section (traveller, partner and admin; partner = `provider` in code; admin and
  partner accounts never book);
- the AI provider in the stack line;
- the `ai:ollama` command;
- a new rule 9 (production is owner-operated);
- a task-oriented documentation map that includes BOOKING_POLICY.

**`MVP_SCOPE.md`** was rewritten:

- Every area is marked **built** or _(planned)_.
- A new section covers roles and terminology.
- The out-of-scope list now says partner-run transport and stays are in scope, while third-party
  inventory (flights, trains, public buses, hotel aggregators) stays out.

The other docs were corrected to match the code and the deployment state:

- ROADMAP: phase status updated, and a new Phase 6 for the owner decisions.
- PRD.
- USER_FLOWS: an implementation status for each flow.
- ARCHITECTURE: the real modules.
- TECH_STACK: the AI row and the undecided items.
- PROJECT_STRUCTURE.
- AI_ARCHITECTURE: Ollama Cloud in production.
- DEPLOYMENT, ENVIRONMENTS and OBSERVABILITY: production live, no staging project.

## Files

| Change   | Path                                               | Notes                                                    |
| -------- | -------------------------------------------------- | -------------------------------------------------------- |
| Created  | `reports/tasks/2026-10-15-docs-scope-alignment.md` | This report                                              |
| Modified | `CLAUDE.md`                                        | Restructured as described above                          |
| Modified | `docs/product/MVP_SCOPE.md`                        | Rewritten: built/planned status, roles, scope boundaries |
| Modified | `docs/product/ROADMAP.md`                          | Phase status, Phase 6, payments post-MVP                 |
| Modified | `docs/product/PRD.md`                              | Accounts, listing types, non-goals, open questions       |
| Modified | `docs/product/USER_FLOWS.md`                       | Implementation status, T4 any-date and whole trip        |
| Modified | `docs/architecture/ARCHITECTURE.md`                | Real module boundaries, AI provider                      |
| Modified | `docs/architecture/TECH_STACK.md`                  | AI row, undecided list (payments, MFA)                   |
| Modified | `docs/architecture/PROJECT_STRUCTURE.md`           | Feature and server domain lists                          |
| Modified | `docs/ai/AI_ARCHITECTURE.md`                       | Production provider, open questions                      |
| Modified | `docs/operations/DEPLOYMENT.md`                    | Status live, owner-run production, staging caveat        |
| Modified | `docs/operations/ENVIRONMENTS.md`                  | Preview/production rows                                  |
| Modified | `docs/engineering/OBSERVABILITY.md`                | Dropped "once the Vercel project exists"                 |

## Architectural and database changes

None.

## Security and migration implications

None. These are documentation changes only. The only security-relevant changes are wording:

- `OLLAMA_API_KEY` is now named as a server-only secret in `CLAUDE.md`.
- `CLAUDE.md` now says agents must not push migrations, change remote env or deploy (the same limits
  `.claude/settings.json` already enforces).

## Tests and commands executed

| Command                                                                 | Result (actual)                                    |
| ----------------------------------------------------------------------- | -------------------------------------------------- |
| `npx prettier --write` on changed docs                                  | Done                                               |
| Relative-link check (Python script over `CLAUDE.md` and `docs/**/*.md`) | 0 broken links                                     |
| `npm run format:check`                                                  | Pass: "All matched files use Prettier code style!" |

## Build, lint and type-check status

- Format: pass
- Lint: not run (docs only)
- Typecheck: not run (docs only)
- Unit tests: not run (docs only)
- Build: not run (docs only)
- E2E: not run
- DB tests: not run

## Known issues, limitations, unverified assumptions

- The deployment state comes from the owner's answer and the 2026-10-15 Ollama report. The production
  Supabase region was not verified, so it is not stated in ENVIRONMENTS.
- ADR-0002 still describes "one person can be traveller and provider". It stays as accepted until a
  new ADR supersedes it. MVP_SCOPE flags this.
- The working tree also contains changes that this task did not make:
  - `supabase/migrations/20261014215750_account_types.sql`
  - changes to `supabase/tests/{identity_and_roles,providers,rate_limits}.test.sql`

  They appear to be in-progress Phase 6 work and were left untouched. The docs still describe one role
  per account as _(planned)_ until that work lands.

## Environment variables or manual steps required

None.

## Addendum: ADR-0007

`docs/decisions/ADR-0007-ONE-ACCOUNT-TYPE-PER-ACCOUNT.md` was written to match the in-progress
migration `20261014215750_account_types` (which already cites ADR-0007). It was added to the ADR index,
which now marks ADR-0002's multi-role premise as superseded. MVP_SCOPE and ROADMAP link to it.
`npm run format:check` passes.

## Follow-up tasks

- A data-model ADR for the guide, accommodation and transport listing types.
- An ADR or decision on the TOTP approach (Supabase Auth MFA is the default candidate).
- Update MVP_SCOPE and ROADMAP from _(planned)_ to **built** as each Phase 6 item lands.
