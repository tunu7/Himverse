# Task Report: Docs cleanup (compact, merge, fix stale facts)

- Date: 2026-10-16
- Author: Claude Code (agent), for the product owner
- Branch / commit: `worktree-payments`, on top of `294de78`

## Objective and scope

The owner chose **"Compact & fix docs"** from the token and infrastructure audit:

- remove table padding;
- fix stale facts;
- merge overlapping docs;
- fold `CONTRIBUTING.md` into the workflow.

Not in scope, by the owner's choice: slimming `CLAUDE.md` or the rules, condensing old reports, and CI
and settings changes.

## Summary

- **Padding removed:** markdown tables in `docs/` and `reports/` lost their alignment padding (410 KB →
  320 KB, **22% smaller**). The two folders are excluded from Prettier (`.prettierignore`) so the padding
  doesn't come back. Tables are written as `| a | b |`.
- **Docs merged:** 58 → 51 files.

  | Removed | Merged into |
  | --- | --- |
  | `architecture/SYSTEM_DESIGN.md`, `architecture/TECH_STACK.md` | `architecture/ARCHITECTURE.md` |
  | `security/AUTHORIZATION_AND_RLS.md` | `security/SECURITY.md` |
  | `api/VALIDATION.md`, `engineering/ERROR_HANDLING.md` | `api/API_CONTRACTS.md` |
  | `product/PRD.md` | `product/MVP_SCOPE.md` |
  | `operations/DEPLOYMENT.md` | `operations/ENVIRONMENTS.md` |
  | `CONTRIBUTING.md` | `engineering/DEVELOPMENT_WORKFLOW.md` |

- **Stale facts fixed:**
  - README status ("not deployed, no payments");
  - roles, two-step login, listing types, payments and admin pages marked as planned (MVP_SCOPE, PRD,
    USER_FLOWS);
  - booking rate limits (SECURITY said 10/30/20; the database enforces 30/60/40);
  - the secret key: no longer "unused" now that payments use it;
  - the webhook: no longer "planned";
  - Razorpay: chosen, not "undecided";
  - leftover "Workstream" and "(planned)" wording.
- **Rules added to the docs** after the last outage and the CI misses:
  - apply migrations before pushing code that uses them (ENVIRONMENTS);
  - run the CI-only checks before pushing to `main` (DEVELOPMENT_WORKFLOW).
- **References updated** in `CLAUDE.md`, the rules, the skills, the agent, README, docs and code
  comments. Applied migrations were not edited.

## Tests and commands executed

| Command | Result (actual) |
| --- | --- |
| Relative-link and `#anchor` check (Python) over docs, README, CLAUDE.md, .claude | 0 broken (after fixing 2 anchors) |
| `npm run verify` | PASS: format, lint, typecheck, 374 unit tests, build |

## Known issues and follow-ups

- **Pending merge:** the other session's uncommitted booking work also edits `CLAUDE.md`, MVP_SCOPE,
  ROADMAP, BOOKING_POLICY, ENVIRONMENTS, DATABASE_DESIGN and the ADR index. Its rebase will have
  conflicts in the merged files. Its additions (price approval, listing type on bookings, Turnstile)
  then need to be written into the merged docs.
- **Not done (owner's choice):** slimming `CLAUDE.md`/rules, condensing reports, CI and settings
  changes.
