# Task Report: Phase 2 — Tourism discovery

- Date: 2026-10-12
- Author: Claude Code (Opus 5.5), plan approved
- Branch / commit: `main`, **uncommitted** on top of `3a503c4` (no commit, push or deploy)

## Objective and scope

A public discovery experience over the real Supabase catalogue:

- browse, search and filter destinations and experiences;
- detail pages for both;
- sorting and pagination with shareable URLs;
- responsive, accessible layouts with every loading, empty, error and success state.

Hidden inventory must never be discoverable.

Decisions approved before implementation:

- **Text-only:** there are no image columns; imagery needs its own storage ADR.
- **Roadmap:** discovery is inserted as Phase 2, so itinerary generation, booking and hardening become
  Phases 3, 4 and 5.
- **`/explore`** permanently redirects to `/experiences`.

Out of scope (not built): AI itineraries, bookings, payments, imagery, relevance ranking, admin content
tools.

## Acceptance criteria

| # | Criterion | Status |
| --- | --- | --- |
| 1 | Browse, search, filter (region, category, budget, duration), sort and page experiences and destinations; every state reproducible from the URL | **Met**: E2E covers each filter, a combination, sorts, pagination, and the form → URL → reload round-trip |
| 2 | Detail pages show all available fields; unknown or hidden slugs show a not-found page with `noindex` | **Met**: returns HTTP 200 + `noindex` (see limitations) |
| 3 | No anonymous discovery of draft destinations, unpublished experiences or suspended/unverified providers' inventory via search, filters, counts or URLs | **Met**: pgTAP (`discovery.test.sql`, mutation-checked) and E2E (search, counts, five hidden experience URLs, two hidden destination URLs) |
| 4 | Malformed parameters never error; results always bounded | **Met**: invalid values dropped with a notice; 12 per page, page ≤ 50, `q` ≤ 100 chars |
| 5 | Responsive, accessible, all UI states | **Met**: 375 px test (no horizontal overflow); labelled `search` landmarks and nav; `role="status"` result summaries; empty, out-of-range, ignored-parameter, not-found and loading states; root error boundary |
| 6 | Quality gate, DB and E2E tests pass; no new dependencies; no secret key | **Met**: see results |

## Summary of implementation

- **Database:**
  - generated `search_vector` columns (English config, so "raft" matches "rafting") with GIN indexes on
    `experiences` and `destinations`;
  - filter and sort indexes;
  - a column grant on `experiences.search_vector`, needed under the column-level grants;
  - no RLS changes: visibility is still decided by the Phase 1 policies.
- **Server (`src/server/catalog`):**
  - `search-options.ts` is the pure shared vocabulary (categories moved here from `features/providers`, so
    `src/server` never imports `src/features`): buckets, sorts and limits;
  - `catalog.ts` adds `searchExperiences`, `getPublicExperience`, `searchDestinations`,
    `getPublicDestination` and `listPublicDistricts`;
  - everything uses the anonymous client with explicit columns, `!inner` joins and a stable `id`
    tie-breaker;
  - search is `textSearch` with a bound parameter;
  - an out-of-range page is reported, not thrown.
- **Feature (`src/features/discovery`):**
  - `search-params.ts` parses each parameter independently (dropping invalid values) and builds canonical
    URLs;
  - components: cards, plain-GET filter forms that work without JavaScript, a results summary and
    pagination.
- **Routes:** `/experiences`, `/experiences/[slug]`, `/destinations` and `/destinations/[slug]`, with
  per-route `not-found.tsx` and `generateMetadata`. `/explore` now redirects with a 308. The header nav
  and the home page link to both list pages.
- **Seed (local only, everything labelled "(sample)"):**
  - 17 public experiences across 6 destinations and 5 districts;
  - deliberately hidden records: two unpublished destinations, a draft provider, a suspended provider, a
    draft experience, and experiences at unpublished destinations.

## Files

| Change | Path | Notes |
| --- | --- | --- |
| Created | `supabase/migrations/20261012142919_discovery_search.sql` | Search columns, GIN and filter indexes, column grant |
| Created | `supabase/tests/discovery.test.sql` | 12 assertions |
| Created | `src/server/catalog/search-options.ts` | Shared vocabulary |
| Created | `src/features/discovery/search-params.ts`, `src/features/discovery/components/{experience-card,destination-card,filter-forms,pagination,results-summary}.tsx` |  |
| Created | `src/app/experiences/{page,[slug]/page,[slug]/not-found}.tsx`, `src/app/destinations/{page,[slug]/page,[slug]/not-found}.tsx` |  |
| Created | `tests/unit/{search-params,catalog-queries}.test.ts`, `tests/e2e/discovery.spec.ts` |  |
| Modified | `src/server/catalog/catalog.ts` | Discovery queries; `listPublicExperiences` removed |
| Modified | `src/features/providers/schemas.ts`, `src/server/providers/providers.ts` | Import categories from `search-options` |
| Modified | `src/lib/format.ts` | `formatCategory` |
| Modified | `src/components/site-header.tsx`, `src/app/page.tsx` | Nav (`aria-label="Main"`), home links |
| Modified | `next.config.ts` | `/explore` → `/experiences` (308) |
| Modified | `playwright.config.ts` | `discovery` project runs before data-creating specs |
| Modified | `supabase/seed.sql` | Expanded local sample data |
| Modified | `supabase/tests/privileges.test.sql` | Column snapshot includes `search_vector` |
| Modified | `src/types/database.ts` | Regenerated |
| Modified | `docs/product/{ROADMAP,USER_FLOWS}.md`, `docs/architecture/{SYSTEM_DESIGN,PROJECT_STRUCTURE}.md`, `docs/database/{DATABASE_DESIGN,DATA_ACCESS_PATTERNS}.md`, `docs/api/API_CONTRACTS.md`, `docs/{security/SECURITY,operations/INCIDENT_RESPONSE,ai/AI_ARCHITECTURE,ai/AI_EVALUATION,ai/ITINERARY_GENERATION,engineering/OBSERVABILITY}.md`, `README.md` | Discovery documentation; phase renumbering |
| Deleted | `src/app/explore/page.tsx`, `tests/e2e/explore.spec.ts` | Replaced by `/experiences` and `discovery.spec.ts` |

## Architectural and database changes

- New migration `20261012142919_discovery_search`.
- **No new tables, policies or RPCs.**
- The only privilege change is `select (search_vector)` on `experiences` for anon and authenticated.
- The layering is preserved, and is now cleaner: shared catalogue vocabulary lives in `src/server/catalog`
  instead of a cross-feature import.

## Security and migration implications

- **Visibility unchanged:** all discovery reads use the anonymous client, so RLS alone decides
  visibility. Verified in SQL (pgTAP, including a mutation run in which removing the policies fails 7
  assertions) and over HTTP (E2E).
- **No injection surface:**
  - search text is a bound `websearch_to_tsquery` parameter;
  - every other filter comes from an allow-list;
  - E2E sends `a,b) or(1=1 'x"` and gets a normal page;
  - malformed slugs are rejected before any query.
- **Bounded reads:** 12 per page, page ≤ 50; the destination count tally is capped at 5,000 rows; the
  district list is capped at 500.
- No secret key, no new dependencies, `npm audit --omit=dev` clean.
- **Migration:** additive (generated columns and indexes), so it's backward compatible. On a large table,
  adding a stored generated column rewrites the table. That's fine at current size; note it for
  production.

## Tests and commands executed

| Command | Result (actual) |
| --- | --- |
| `npx supabase db reset` + anon sanity query | 17 visible experiences, 6 destinations; "raft" → only the public trip |
| `npm run db:test` (final, after fresh reset) | **PASS: 7 files, 176 assertions** |
| Mutation: permissive anon policies on experiences and destinations | 7 discovery assertions failed as expected; reset restored |
| `npm run db:types` + `cmp` | Up to date |
| `npm test` | **140 tests in 12 files** pass (+34: URL contract, query mapping) |
| `npm run build` with `.env.local` moved aside | **Pass**: no DB or env needed at build |
| `npm run verify` | **Pass**, exit 0 |
| `npm run test:e2e` (CI-like: agent env vars stripped, `CI=1`) | **37/37 pass** |
| `npm run test:e2e` (normal), twice in a row without reset | **37/37** both times (repeatable on a used DB) |
| Link audit / secret scan / `npm audit --omit=dev` | 0 problems / clean / 0 vulnerabilities |
| GitHub CI | **Not run** for these uncommitted changes (the last pushed commit `3a503c4` is green) |

## Build, lint and type-check status

- Format: pass
- Lint: pass
- Typecheck: pass
- Unit tests: pass (140/140)
- Build: pass, with and without environment variables
- E2E: pass (37/37)
- DB tests: pass (176/176)

## Issues found and fixed during implementation

1. **`/destinations` crashed** (real bug, found by E2E). PostgREST's embedded `experiences(count)` reads
   whole rows, which needs table-level SELECT; Phase 1 hardening deliberately replaced that with column
   grants.
   - Fix: a bounded second query fetching only `destination_id`, tallied in the app, still under anon RLS.
   - I didn't widen the grant.
   - pgTAP's SQL `count(*)` didn't catch this; only the real PostgREST path did. The pattern is documented
     in DATA_ACCESS_PATTERNS.
2. **Layering:** the first draft had `src/server` importing from `src/features`, and one feature
   importing another. The shared vocabulary was moved to `src/server/catalog/search-options.ts`.
3. **Test flakiness by design:** the lifecycle spec briefly publishes an experience, which could race
   with exact discovery counts. Discovery now runs as a separate Playwright project before
   data-creating specs.
4. **Test-only fixes:**
   - Playwright has no `test.each`;
   - the "Loading…" placeholder also has `role="status"`, so the results summary got
     `data-testid="results-summary"`;
   - two `robots` meta tags meant asserting that a `noindex` tag exists.
5. **Housekeeping:** `aria-current` was removed from the non-link page indicator, and a `git rm` that
   staged a deletion was unstaged, so everything is left unstaged for your review.

## Known issues, limitations, unverified assumptions

- **Not-found detail pages return HTTP 200 with `noindex`,** not 404. `notFound()` runs inside the
  streamed Suspense boundary under Cache Components. Fixing it needs the lookup before streaming (for
  example, cached public reads), which is a follow-up.
- **No relevance ranking:** results default to newest. Ranking would need an RPC with `ts_rank`.
- **Search scope:**
  - experience search doesn't match its destination's name; use the region filter for that;
  - English stemming may treat some local names oddly.
- **Offset pagination** is fine at this size; switch to keyset for thousands of rows.
- **Budget filters exclude unpriced experiences,** which then show as "Price on request". This is
  intended, but confirm it with product.
- **Region is the district;** there's no broader region concept in the schema.
- **Local test data:**
  - discovery E2E counts assume the seed; after an interrupted local E2E run, `npx supabase db reset`
    first;
  - real inventory needs provider and admin content; the seed is local only.
- **CI:** hasn't run on these changes yet. GitHub warned that the checkout, setup-node and
  upload-artifact actions run on Node 20 (deprecated), and `ubuntu-latest` moves to Ubuntu 26 on
  2026-10-19.

## Environment variables or manual steps required

None new. For local runs: `npx supabase db reset` (applies the migration and the new seed), then
`npm run dev`.

## Follow-up tasks

1. Review and commit (suggested: `feat: phase 2 tourism discovery with search and filters`), then push
   so CI runs.
2. Return 404 for not-found detail pages (move the lookup before streaming, or cache public reads).
3. Imagery: storage bucket, policies and admin upload, via ADR.
4. Admin content tools for destinations and experience editing, so real inventory doesn't depend on SQL.
5. Optional: relevance ranking (RPC), keyset pagination when the catalogue grows, and the GitHub Actions
   Node 24 upgrade.
