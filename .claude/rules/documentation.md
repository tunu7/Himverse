---
paths:
  - "docs/**"
  - "reports/**"
  - "*.md"
  - ".claude/**/*.md"
---

# Documentation and change reporting

- `docs/product/MVP_SCOPE.md` is authoritative for scope; keep other docs consistent with it.
- Document facts that match the code. Mark planned items as _(planned)_ and unknowns as **open questions** —
  never invent requirements.
- Significant decisions get an ADR in `docs/decisions/` (see its README); update the ADR index.
- Every relative link must resolve to a real file. Prefer linking to a doc over duplicating its content.
- `CLAUDE.md` stays concise; detail goes in docs and `.claude/rules/`.
- Significant tasks end with `reports/tasks/YYYY-MM-DD-<slug>.md` from
  docs/engineering/TASK_REPORT_TEMPLATE.md, recording commands actually run and their actual results.
- Don't edit the managed block in `AGENTS.md` (written by `next dev`).
