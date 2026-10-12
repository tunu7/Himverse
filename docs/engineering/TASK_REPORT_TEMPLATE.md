# Task Report Template

Copy to `reports/tasks/YYYY-MM-DD-<short-task-slug>.md` for every significant task. Fill every section;
write "None" rather than deleting a section. Report only what actually happened.

```markdown
# Task Report: <title>

- Date: YYYY-MM-DD
- Author: <human or agent>
- Branch / commit: <branch> / <sha or "uncommitted">

## Objective and scope

What was asked, acceptance criteria, and what was explicitly out of scope.

## Summary of implementation

What was built and how, in a few paragraphs.

## Files

| Change   | Path | Notes |
| -------- | ---- | ----- |
| Created  |      |       |
| Modified |      |       |
| Deleted  |      |       |

## Architectural and database changes

New modules, boundaries, tables, policies, functions. Link ADRs.

## Security and migration implications

RLS changes, secrets, new trust boundaries, data migration/backfill, rollback plan.

## Tests and commands executed

| Command | Result (actual) |
| ------- | --------------- |
|         |                 |

## Build, lint and type-check status

- Format: pass/fail/not run
- Lint: pass/fail/not run
- Typecheck: pass/fail/not run
- Unit tests: pass/fail/not run (counts)
- Build: pass/fail/not run
- E2E: pass/fail/not run
- DB tests: pass/fail/not run

## Known issues, limitations, unverified assumptions

## Environment variables or manual steps required

## Follow-up tasks
```
