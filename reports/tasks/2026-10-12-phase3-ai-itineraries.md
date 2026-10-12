# Task Report: Phase 3 — AI itinerary generation

- Date: 2026-10-12
- Author: Claude Code (Opus 5.5), plan approved
- Branch / commit: `main`, **uncommitted** on top of `546672b` (no commit, push or deploy)

## Objective and scope

An AI itinerary workflow:

- collect and validate preferences on the server;
- retrieve eligible inventory deterministically;
- generate a structured plan through a replaceable provider adapter;
- validate it against trusted data;
- persist it privately with versions;
- let travellers view, refine, regenerate, restore and delete.

Decisions made with you before implementation:

- **Provider:** Vercel AI Gateway through AI SDK 7.
- **Credentials:** none yet, so verification uses mocks only.
- **Prices:** per person.

My additions, which were in the approved plan: INR only, and owner-only access with no sharing.

Out of scope (not built): bookings, payments, sharing, streaming, live-model evaluation.

## Summary of implementation

- **ADR-0003** records the provider, the grounding model, persistence and access, and the alternatives
  that were rejected.
- **Database (migration `20261012145550_itineraries`):**
  - `itineraries` (owner-only);
  - `itinerary_versions` and `itinerary_items` (immutable; items keep database snapshots of title, price
    and duration);
  - `itinerary_generations` (a log with no prompt text);
  - `save_itinerary_version`, a `security definer` function that checks ownership, **re-checks that
    every experience is public now and at the stated destination**, snapshots from the database and
    computes the total itself;
  - `record_itinerary_generation`;
  - a composite FK so the current version always belongs to its own itinerary.
- **Server (`src/server/itineraries/`):**
  - `preferences.ts`: an IST-aware date window, 1–14 days, ≤ 12 travellers, INR, notes ≤ 500 characters;
  - `retrieval.ts`: anonymous client, so public inventory only; widens with a label when interests are
    too narrow; capped at 40 experiences and 10 destinations;
  - `prompt.ts`: `itinerary-v1`, records as **aliases only**, notes fenced, 24k-character cap;
  - `schemas.ts`: `itinerary.v1` and the stored-plan schema;
  - `validate.ts`: aliases, day count, server-derived dates, duplicates, daily capacity, multi-day
    items, budget from **database prices**;
  - `pipeline.ts`: rate limit, an empty-inventory stop with **no model call**, one repair attempt,
    error mapping and logging;
  - `model/`: the interface, the AI Gateway adapter (`generateText` + `Output.object`, 45 s timeout,
    one retry, capped tokens), a deterministic mock (**refused when `VERCEL_ENV=production`**) and the
    factory;
  - `repository.ts` and `service.ts`.
- **Feature and UI:**
  - form parsing and five Server Actions (create, refine, regenerate, make current, delete);
  - the preferences form, the plan view (a not-a-booking notice, an indicative total, "no longer
    available" markers, things to check), refine and version controls;
  - routes `/itineraries`, `/itineraries/new` and `/itineraries/[id]` (with not-found);
  - `/itineraries` added to the proxy's protected prefixes, and a "Trips" nav link.
- **Configuration:** `AI_PROVIDER`, `AI_ITINERARY_MODEL` and `AI_GATEWAY_API_KEY` (server-only) in
  `.env.example` and the docs. Playwright runs the app with `AI_PROVIDER=mock`.

## Files

| Change   | Path                                                                                                                                                                                                                                                                                                                                                                      | Notes                                                |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Created  | `supabase/migrations/20261012145550_itineraries.sql`                                                                                                                                                                                                                                                                                                                      | Tables, RLS, RPCs                                    |
| Created  | `supabase/tests/itineraries.test.sql`                                                                                                                                                                                                                                                                                                                                     | 35 assertions                                        |
| Created  | `src/server/itineraries/{preferences,retrieval,prompt,schemas,validate,pipeline,repository,service}.ts`, `src/server/itineraries/model/{types,gateway,mock,index}.ts`                                                                                                                                                                                                     |                                                      |
| Created  | `src/features/itineraries/{schemas,actions}.ts`, `src/features/itineraries/components/{preferences-form,itinerary-controls,itinerary-view}.tsx`                                                                                                                                                                                                                           |                                                      |
| Created  | `src/app/itineraries/{page,new/page,[id]/page,[id]/not-found}.tsx`                                                                                                                                                                                                                                                                                                        |                                                      |
| Created  | `src/lib/itinerary-options.ts`, `src/lib/catalog-options.ts`                                                                                                                                                                                                                                                                                                              | Shared constants; see "Issues found"                 |
| Created  | `tests/unit/{itinerary-core,itinerary-pipeline,itinerary-retrieval,itinerary-gateway-model,itinerary-actions}.test.ts`, `tests/unit/itinerary-fixtures.ts`, `tests/e2e/itineraries.spec.ts`                                                                                                                                                                               |                                                      |
| Created  | `docs/decisions/ADR-0003-AI-ITINERARY-GENERATION.md`, this report                                                                                                                                                                                                                                                                                                         |                                                      |
| Deleted  | `src/server/catalog/search-options.ts`                                                                                                                                                                                                                                                                                                                                    | Moved to `src/lib/catalog-options.ts`                |
| Modified | `package.json`, `package-lock.json`                                                                                                                                                                                                                                                                                                                                       | `ai@^7` (7.0.137)                                    |
| Modified | `src/lib/env.ts`, `src/lib/env.server.ts`, `.env.example`                                                                                                                                                                                                                                                                                                                 | AI environment contract                              |
| Modified | `src/proxy.ts`, `src/components/site-header.tsx`                                                                                                                                                                                                                                                                                                                          | Protected prefix; nav link and mobile wrapping       |
| Modified | `supabase/tests/{privileges,catalog,discovery,providers,security_review,system_roles}.test.sql`                                                                                                                                                                                                                                                                           | Snapshot additions; truncate `itinerary_items`       |
| Modified | `playwright.config.ts`, `tests/e2e/*.spec.ts`                                                                                                                                                                                                                                                                                                                             | Mock provider for E2E; visible-only test-id locators |
| Modified | `eslint.config.mjs`                                                                                                                                                                                                                                                                                                                                                       | Ignore Playwright output folders                     |
| Modified | Imports in `src/server/catalog/catalog.ts`, `src/features/{providers,discovery}/…`, `tests/unit/{search-params,catalog-queries}.test.ts`                                                                                                                                                                                                                                  | Path change only                                     |
| Modified | `src/types/database.ts`                                                                                                                                                                                                                                                                                                                                                   | Regenerated                                          |
| Modified | `docs/ai/{AI_ARCHITECTURE,ITINERARY_GENERATION,AI_EVALUATION}.md`, `docs/database/{DATABASE_DESIGN,DATA_ACCESS_PATTERNS}.md`, `docs/security/AUTHORIZATION_AND_RLS.md`, `docs/operations/ENVIRONMENTS.md`, `docs/engineering/OBSERVABILITY.md`, `docs/product/{ROADMAP,USER_FLOWS}.md`, `docs/architecture/PROJECT_STRUCTURE.md`, `docs/decisions/README.md`, `README.md` |                                                      |

## Architectural and database changes

- New feature module `itineraries` and server domain `src/server/itineraries`, with downward-only
  imports kept.
- One migration adds four tables, two public RPCs and one private helper (`owns_itinerary`). No existing
  policies changed.
- The privilege snapshot now explicitly lists every new table, column and function grant.

## Security and migration implications

- **Model output can't reach the wrong data:**
  - the model sees aliases, not IDs;
  - unknown aliases are rejected;
  - the save RPC re-checks visibility;
  - forged or hallucinated UUIDs, hidden providers' experiences, draft destinations and mismatched
    destinations are all rejected (pgTAP).
- **Costs are never taken from the model.** The validator and the RPC compute them from database prices.
- **Privacy:**
  - owner-only with no sharing;
  - other users get not-found (pgTAP + E2E);
  - versions and items are immutable, and direct inserts or updates are denied (pgTAP);
  - the generation log is owner-readable and can't be linked to someone else's itinerary.
- **Secrets:** the AI Gateway key is read only through `env.server.ts`. **A browser-bundle scan finds no
  gateway code, gateway URL or secret names.**
- **Prompt injection:** traveller notes are fenced and escaped, and the model has no tools. Output is
  still schema- and grounding-checked.
- **Abuse limits:** 10 generations per hour and 30 per day per user; bounded inputs, prompt size, output
  tokens and timeout.
- **Migration:** purely additive. In production, apply it before the code that uses it.

## Tests and commands executed

| Command                                                                                                | Result (actual)                                                                  |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `npm install ai@^7`                                                                                    | 7.0.137; `npm audit --omit=dev`: 0 vulnerabilities                               |
| Gateway model list (`ai-gateway.vercel.sh/v1/models`)                                                  | `anthropic/claude-sonnet-5.5` and `claude-haiku-5.5` listed (2026-10-12)         |
| `npm run db:test` (final, after fresh reset)                                                           | **PASS: 8 files, 219 assertions**                                                |
| Mutation: other users read all itineraries, direct version inserts, `is_provider_verified` always true | 4 itinerary assertions failed as expected; reset restored                        |
| Adapter tests with `MockLanguageModelV4`                                                               | 5/5, including a **real SDK timeout mapped to `timeout`**                        |
| `npm run verify` (final)                                                                               | **Pass**: **207 unit tests in 17 files**, build                                  |
| `npm run build` without `.env.local`                                                                   | **Pass**                                                                         |
| Browser-bundle scan (`.next/static`)                                                                   | No `AI_GATEWAY_API_KEY`, gateway URL, `createGateway` or `SUPABASE_SECRET_KEY`   |
| `npm run test:e2e`, CI-like (agent env stripped, `CI=1`), fresh DB                                     | **42/42**                                                                        |
| `npm run test:e2e`, normal, 3× in a row on the used DB                                                 | **42/42** each time                                                              |
| `npm run lint` after a CI-mode Playwright report exists                                                | Pass (was failing; see issues)                                                   |
| Link audit / secret scan                                                                               | 0 problems / clean                                                               |
| **Live AI Gateway call**                                                                               | **Not run: no credentials.** Real-model quality, latency and cost are unverified |
| GitHub CI                                                                                              | **Not run** for these uncommitted changes                                        |

## Build, lint and type-check status

- Format: pass
- Lint: pass
- Typecheck: pass
- Unit tests: pass (207/207)
- Build: pass, with and without environment variables
- E2E: pass (42/42)
- DB tests: pass (219/219)

## Issues found and fixed during implementation

1. **Stored preferences would always fail to parse** (my bug, caught in review before tests). They were
   parsed with the new-trip schema anchored at 1970, whose "within two years" rule rejects every real
   date. Fixed with a separate `storedPreferencesSchema` that has no date-window rules.
2. **Mobile overflow regression** (caught by the existing E2E): the new "Trips" nav link made the page
   47 px wider than a 375 px screen. The header now wraps.
3. **Layering rule violation** (mine, from Phase 2 onward):
   - client components imported constants from `src/server/**`, which the project rules forbid;
   - the modules were pure, so nothing leaked (the bundle scan confirms it);
   - the fix moved the shared vocabulary to `src/lib/catalog-options.ts` and
     `src/lib/itinerary-options.ts`;
   - no client file now imports a value from `src/server`.
4. **Timing-dependent E2E counts.** Next.js 16 with Cache Components keeps up to 3 previous routes
   mounted but hidden (React `<Activity>`), so test-id counts after a client navigation could include
   hidden elements. All test-id locators now match visible elements only.
5. **`verify` failed after a CI-mode E2E run:** ESLint linted the generated `playwright-report/`. The
   Playwright output folders are now ignored.
6. **One unexplained E2E failure.** In one early run, three itinerary tests failed on a URL assertion.
   No failed generation was logged, so the failure happened before the model call. It didn't reproduce
   in 7 later runs. It may have been the hidden-route issue in (4), but **I haven't confirmed that.**
7. Test-only fixes: a pgTAP plan count, the route announcer's `role="alert"`, and a stricter Zod error
   path (`interests.0`).

## Known issues, limitations, unverified assumptions

- **No real model has been called.** Prompt quality, the structured-output reliability of
  `anthropic/claude-sonnet-5.5`, latency (the 45 s budget) and cost per itinerary are unverified. The
  first task with a key is a live smoke test plus the evaluation set.
- **The prompt is in English only.** Rationales are model text rendered as plain text.
- **Per-person pricing is an assumption** (your decision, documented). Unpriced items are excluded from
  totals and flagged.
- **Rate limiting** is counted from the database, so concurrent requests can overshoot slightly.
- **Generation blocks the request** (no streaming); the form shows a pending state.
- **Not-found itinerary pages** return HTTP 200 with `noindex` (the same Cache Components streaming
  trade-off as in Phase 2).
- **Travel times, seasonality and permit data** don't exist in the schema. The UI and prompt treat them
  only as things to check.
- **CI hasn't run on this change.** E2E in CI will use the mock through `playwright.config.ts`.

## Environment variables or manual steps required

- **Locally:** nothing new for tests (the mock is set by Playwright). To try real generation, add
  `AI_GATEWAY_API_KEY` to `.env.local` yourself (I never read it) and keep `AI_PROVIDER=gateway`.
- **On Vercel:** enable AI Gateway for the project (OIDC); optionally set `AI_ITINERARY_MODEL`. **Never
  set `AI_PROVIDER=mock` in production**; it is refused anyway.
- Apply migration `20261012145550_itineraries` to each hosted Supabase project before deploying.

## Follow-up tasks

1. Review and commit (suggested: `feat: phase 3 AI itinerary generation`), then push so CI runs.
2. With a gateway key: a live smoke test, the evaluation set and baseline (`docs/ai/AI_EVALUATION.md`),
   and a cost-ceiling decision.
3. Streaming progress during generation.
4. Return a real 404 for not-found detail pages (shared with Phase 2).
