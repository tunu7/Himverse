# Task Report: Stays and transport in AI itineraries (Phase 3b)

- Date: 2026-10-15
- Author: Claude Code (agent), for the product owner
- Branch / commit: main / uncommitted

## Objective and scope

Owner request: "start phase 3b". AI itineraries include a partner stay for each night and transport
legs between bases, and "Book whole trip" books them ([ADR-0008](../../docs/decisions/ADR-0008-LISTING-TYPES.md)).
The Phase 3a security review's should-fixes are included. Out of scope: shared (seat) transport,
multi-room-type stays, guides in itineraries, payments.

Acceptance criteria:

- Plans use only bookable stays and transport retrieved from our database, referenced by alias.
- Stays are at the day's base, not on the last day, with rooms for the whole group. Transport goes from
  the previous base to the new one, or is day hire at the base, with enough vehicles.
- The database re-validates and prices every item by its kind.
- Whole-trip booking turns consecutive stay nights into one booking; retries never duplicate.
- Travellers can switch stays and transport off. Nothing is presented as availability.

## Summary of implementation

- **Database:** `itinerary_item_kind` and `units` on `itinerary_items`. `save_itinerary_version`
  validates each kind (type, destination or route end, bookable, units within capacity and enough for
  the party, no stay on the last day) and prices activities per person, stays per room-night and
  transport per vehicle. `request_itinerary_bookings` groups consecutive nights at one stay into one
  `request_listing_booking`, with per-group keys derived from the request key.
- **3a review fixes:** `private.valid_languages` and a route ≠ destination check (both `NOT VALID`),
  one P0002 message for hidden and unknown listings, NULL-safe replay checks, and a `FOR NO KEY UPDATE`
  listing lock on confirmation.
- **AI pipeline:** retrieval of stays and transport (20 each, filtered by group fit), schema
  `itinerary.v2`, prompt `itinerary-v3` (S#/T# aliases with guests per room and seats per vehicle, no
  ids or prices), validation and cost estimate by unit, mock model support.
- **UI:**
  - The itinerary shows "Transport" and "Stay tonight" lines with rooms or vehicles.
  - The trip form has "Suggest places to stay" and "Suggest private vehicles" options.
  - Whole-trip booking lists one line per request, with stays shown as check-in to check-out.
  - Booking pages show stays as nights with their rooms, and the partner inbox shows units.
  - Capacity wording now reads "2 rooms of this type" instead of "available".
  - Partner forms reject a route that ends where it starts.

## Files

| Change   | Path                                                                                                                                                                                                                                              | Notes                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Created  | `supabase/migrations/20261015101124_itinerary_stays_transport.sql`                                                                                                                                                                                | Schema, RPCs, 3a fixes                         |
| Created  | `supabase/tests/itinerary_stays.test.sql`                                                                                                                                                                                                         | 26 pgTAP tests                                 |
| Created  | `tests/e2e/itinerary-stays.spec.ts`                                                                                                                                                                                                               | Plan with a stay, book the whole trip          |
| Created  | `reports/tasks/2026-10-15-ai-stays-transport-3b.md`                                                                                                                                                                                               | This report                                    |
| Modified | `src/server/itineraries/{retrieval,prompt,schemas,validate,pipeline,repository,preferences}.ts`, `model/mock.ts`                                                                                                                                  | AI pipeline                                    |
| Modified | `src/features/itineraries/{schemas.ts,components/itinerary-view.tsx,components/preferences-form.tsx}`                                                                                                                                             | Plan view and options                          |
| Modified | `src/features/bookings/components/{trip-booking-section,trip-booking,booking-detail,listing-booking-form}.tsx`                                                                                                                                    | Booking UI                                     |
| Modified | `src/server/bookings/repository.ts`, `src/lib/{format,listing-options}.ts`, `src/features/providers/schemas.ts`, `src/app/(site)/experiences/[slug]/page.tsx`, `src/app/provider/bookings/page.tsx`, `src/app/(site)/{bookings,account}/page.tsx` | Listing type on bookings, wording, route check |
| Modified | `src/types/database.ts`                                                                                                                                                                                                                           | Regenerated                                    |
| Modified | `supabase/tests/{privileges,bookable}.test.sql`                                                                                                                                                                                                   | Grants snapshot; stricter replay assertion     |
| Modified | `tests/unit/itinerary-{fixtures,core,pipeline,retrieval}.test.ts`, `tests/e2e/listing-types.spec.ts`                                                                                                                                              | New shapes and cases                           |
| Modified | `docs/decisions/ADR-0008-LISTING-TYPES.md`, `docs/ai/{ITINERARY_GENERATION,AI_ARCHITECTURE}.md`, `docs/database/DATABASE_DESIGN.md`, `docs/product/{MVP_SCOPE,ROADMAP,BOOKING_POLICY}.md`                                                         | Docs                                           |
| Deleted  | None                                                                                                                                                                                                                                              |                                                |

## Architectural and database changes

- No new tables.
- Changed tables: `itinerary_items` gains `item_kind` and `units`; `experiences` gains two `NOT VALID`
  checks.
- Replaced functions: `save_itinerary_version`, `request_itinerary_bookings`,
  `request_listing_booking` and `respond_to_booking`. Their signatures and grants are unchanged.
- ADR-0008 now has a Phase 3b section.

## Security and migration implications

An independent security review (security-reviewer agent) found **no blockers**. I fixed its
should-fixes:

- the replay test no longer passes when every request fails;
- a test now covers reusing a key with different details;
- the new checks are `NOT VALID`;
- the app rejects a route that ends at its own destination.

From its nits, I added the no-stay-on-the-last-day and party-fit checks to the database and the app.

Prices, units, dates and party size always come from the database or the stored version, never from
the model or the form. Ownership checks are unchanged. The added embed reads only `listing_type` under
existing RLS.

**Deploy order:** apply the migration before deploying the code. The new code reads
`item_kind`/`units`. The old code works against the new database, because the defaults are activity
and 1.

**Rollback:** redeploy the previous code. The migration is additive. The replaced functions accept the
old item shape, because a missing kind defaults to activity.

## Tests and commands executed

| Command                                                   | Result (actual)                                      |
| --------------------------------------------------------- | ---------------------------------------------------- |
| `npx supabase db reset` then `npm run db:test`            | PASS: 17 files, 451 tests                            |
| `npm run verify`                                          | PASS: format, lint, typecheck, 354 unit tests, build |
| `npx playwright test --workers=1` (after the final build) | PASS: 65 tests                                       |
| security-reviewer agent                                   | No blockers; should-fixes applied as above           |

## Build, lint and type-check status

- Format: pass
- Lint: pass
- Typecheck: pass
- Unit tests: pass (354)
- Build: pass
- E2E: pass (65, one worker)
- DB tests: pass (451)

## Known issues, limitations, unverified assumptions

- The E2E covers stays end to end. A transport leg is not covered by E2E, because the mock model only
  changes base when a destination runs out of experiences. Transport is covered by unit and pgTAP
  tests.
- If the viewer can no longer see a listing (archived or hidden), its booking is shown as a plain date
  range without nights or rooms.
- Local day-hire and between-places transport share the label "Transport".
- Partner-written stay and transport titles appear in the prompt as data, as experience titles already
  do. The output is constrained to aliases and validated.

## Environment variables or manual steps required

No new environment variables. The owner must:

1. Run `npx supabase db push --linked`. This applies `listing_types` (if not yet applied) and
   `itinerary_stays_transport`.
2. Deploy the code.
3. Optionally, run
   `select id from public.experiences where route_to_destination_id = destination_id or not private.valid_languages(languages);`.
   If it returns no rows, run
   `alter table public.experiences validate constraint experiences_languages_items, validate constraint experiences_route_elsewhere;`
   (two separate statements if needed).

## Follow-up tasks

- Store the listing type on bookings, so labels survive hidden listings.
- Label day hire separately from routes in the itinerary.
- Add an E2E for transport legs, using a seeded multi-destination fixture.
