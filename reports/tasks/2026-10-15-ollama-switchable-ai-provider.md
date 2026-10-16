# Task Report: Switchable AI provider with free local models (Ollama)

- Date: 2026-10-15
- Author: Claude Code (agent)
- Branch / commit: main / uncommitted (base fc652ea)

## Objective and scope

Make AI itinerary generation work, let the owner switch models without code changes, and use a free
model for now (Ollama). Out of scope: hosting Ollama for production, prompt changes, streaming.

## Summary of implementation

- `AI_PROVIDER` now accepts `ollama` alongside `gateway` and `mock`. `AI_ITINERARY_MODEL` defaults per
  provider. `OLLAMA_BASE_URL` and `AI_MODEL_TIMEOUT_MS` are new, all Zod-validated in `src/lib/env.ts`.
- The gateway adapter became a provider-agnostic AI SDK adapter (`model/ai-sdk.ts`). `gateway.ts` and
  `ollama.ts` only build the language model. Ollama goes through `@ai-sdk/openai-compatible` with
  structured outputs on.
- The output schema sent to the model is narrowed to each request: exactly N days, day numbers 1..N,
  and only the retrieved aliases. Answers are still parsed with the general schema and checked by
  `validate.ts`. This raised the small model's success rate from 1 of 3 to 3 of 3 real-app runs.
- `npm run ai:ollama [-- <base>]` builds `himverse-planner` with a 16k context. We verified that
  Ollama's OpenAI-compatible API truncates prompts to about 2k tokens and ignores `num_ctx` sent per
  request.
- The pipeline uses the model's own timeout (180 s by default for Ollama). Rejected plans are logged as
  `itineraries.plan_rejected`, with server messages only.

## Files

| Change | Path | Notes |
| --- | --- | --- |
| Created | `src/server/itineraries/model/ollama.ts` | Ollama factory |
| Created | `src/server/itineraries/model/ai-sdk.ts` | Shared adapter (was `gateway.ts`) |
| Created | `scripts/setup-ollama.mjs` | `npm run ai:ollama` |
| Created | `tests/unit/itinerary-ollama-model.test.ts` | Request shape, narrowed schema, error mapping |
| Created | `docs/decisions/ADR-0006-SWITCHABLE-AI-PROVIDER-OLLAMA.md` |  |
| Modified | `src/server/itineraries/model/{gateway,index,types}.ts` | Thin gateway factory, provider switch, timeout |
| Modified | `src/server/itineraries/{pipeline,schemas}.ts` | Constraints, timeout, rejection log |
| Modified | `src/lib/env.ts`, `src/lib/env.server.ts` | New AI env contract |
| Modified | `tests/unit/env.test.ts`, `tests/unit/itinerary-pipeline.test.ts` |  |
| Modified | `package.json`, `package-lock.json` | `@ai-sdk/openai-compatible`, `ai:ollama` |
| Modified | `.env.example`, `docs/operations/ENVIRONMENTS.md`, `docs/ai/AI_ARCHITECTURE.md`, `docs/decisions/{README,ADR-0003}.md` |  |

## Architectural and database changes

No database changes. A new model adapter boundary is described in ADR-0006, which extends ADR-0003.

## Security and migration implications

- No secrets were added. Ollama needs no key, and `OLLAMA_BASE_URL` is server-only config, not user
  input.
- A localhost Ollama URL is refused on Vercel preview and production.
- Model output stays untrusted: it is checked by the general schema, then by `validate.ts`, then
  re-checked by the save RPC. This is unchanged.
- Rollback: set `AI_PROVIDER=gateway`.

## Tests and commands executed

| Command | Result (actual) |
| --- | --- |
| `npm run verify` | Pass. 23 files, 279 unit tests; build OK |
| `npx playwright test tests/e2e/itineraries.spec.ts` | First run: 3 failed at sign-up (local auth rate limit after repeated runs). Rerun after 5 min: 33 passed |
| Live pipeline, fixture catalogue, various models (temp test) | See the ADR-0006 table |
| Live real-app flow, `next start` + local Supabase + `gemma3:4b` (temp Playwright spec, deleted) | Before narrowing: 1 of 3 saved. After: 3 of 3 saved, ~44 s each |

## Build, lint and type-check status

- Format: pass
- Lint: pass
- Typecheck: pass
- Unit tests: pass (279)
- Build: pass
- E2E: pass (itineraries spec and its dependencies, 33)
- DB tests: not run (no schema changes)

## Known issues, limitations, unverified assumptions

- Small local models produce simpler plans than Claude and can still fail harder trips, for example
  multi-day treks. The user then sees the existing "couldn't create a valid itinerary" error.
- The gateway path's behaviour with the narrowed JSON schema has not been verified live (no gateway
  key). Unit tests cover it through the shared adapter.
- The live Ollama tests are not part of CI.

## Environment variables or manual steps required

`brew install ollama && brew services start ollama`, then `npm run ai:ollama`, then set
`AI_PROVIDER=ollama` in `.env.local`, then restart the dev server.

## Follow-up tasks

- An evaluation set comparing models ([AI_EVALUATION](../../docs/ai/AI_EVALUATION.md)).

## Addendum: Ollama in production

- `OLLAMA_API_KEY` is new and sent as a bearer token. On Vercel preview and production, an Ollama setup
  needs a remote HTTPS `OLLAMA_BASE_URL`, a key and an explicit model; anything else fails env
  validation. The default timeout for a remote Ollama is 90 s.
- Docs: ENVIRONMENTS ("Ollama in production"), RELEASE_CHECKLIST, ADR-0006 decision 8, `.env.example`.
- Tests: 286 unit tests pass, including the deployed-env rules and the bearer header.
- **Unverified:** no live call to Ollama Cloud, because no key is available in this session. The request
  shape is covered by unit tests only.
- **Manual step:** create an Ollama Cloud key, then set the four variables in Vercel and redeploy.

## Addendum: production failures on Ollama Cloud

- **Symptom:** every production trip failed with `UPSTREAM_UNAVAILABLE` after 8–12 s, with no
  provider error logged.
- **Cause:** Ollama Cloud ignores structured-output settings, and `gpt-oss:120b` answered in
  Markdown. Reproduced with `curl` using the exact request body.
- **Fix:** prompt `itinerary-v2` spells out the narrowed JSON Schema in the system prompt. In manual
  `curl` runs, cloud models returned valid JSON 6 of 6 times (`gpt-oss:120b`, `gemma4:31b`,
  `gpt-oss:20b`).
- **Vercel production env:** `AI_PROVIDER`, `OLLAMA_BASE_URL`, `AI_ITINERARY_MODEL=gpt-oss:120b` and
  `OLLAMA_API_KEY` (sensitive) are set.
- `npm run verify`: pass (287 unit tests).
