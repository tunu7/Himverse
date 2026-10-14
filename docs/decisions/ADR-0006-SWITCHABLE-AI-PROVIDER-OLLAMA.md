# ADR-0006: Switchable AI provider, with Ollama for free local models

- Status: Accepted
- Date: 2026-10-15
- Deciders: Product owner (free model for now, switchable later), Engineering
- Extends: [ADR-0003](ADR-0003-AI-ITINERARY-GENERATION.md). Grounding, validation, persistence and
  limits are unchanged.

## Context

ADR-0003 routes itinerary generation through the Vercel AI Gateway, which needs a paid key. The product
owner wants a free model that works now, and the ability to change models later without code changes.

## Decision

1. **Providers are chosen by env.** `AI_PROVIDER` is `gateway`, `ollama` or `mock`. `AI_ITINERARY_MODEL`
   picks the model. Each provider has its own default and model-name format, validated in `src/lib/env.ts`.
2. **Ollama through `@ai-sdk/openai-compatible`.** This is a first-party AI SDK package and the only new
   dependency. It calls Ollama's OpenAI-compatible endpoint (`OLLAMA_BASE_URL`, default
   `http://127.0.0.1:11434/v1`), and needs no key. Structured outputs are on, so Ollama constrains
   decoding to our JSON schema.
3. **One shared adapter** (`model/ai-sdk.ts`) handles every AI SDK provider: the structured output, the
   timeout and the error mapping. `gateway.ts` and `ollama.ts` only build the `LanguageModel`.
4. **The output schema is narrowed to each request.** The schema sent to the model allows exactly N days,
   only the retrieved destination and experience aliases, and day numbers from 1 to N. Answers are still
   parsed with the general `itinerary.v1` schema and checked by `validate.ts`. That way, a provider that
   ignores the schema still gets specific repair messages. The schema version is unchanged, because
   every narrowed answer is a valid `itinerary.v1`.
5. **Per-provider timeout.** `AI_MODEL_TIMEOUT_MS` defaults to 45 s for the gateway and 180 s for
   Ollama. The model reports its own timeout and the pipeline uses it.
6. **Context window.** Ollama's OpenAI-compatible API ignores per-request `num_ctx` and silently
   truncates prompts to the server default. We measured a ~6k-token prompt being cut to 2,050 tokens.
   `npm run ai:ollama [-- <base>]` builds a `himverse-planner` model with `num_ctx 16384` from any base
   model. That is the Ollama default, so switching local models is one command and no env change.
7. **Guardrails.** A localhost `OLLAMA_BASE_URL` is refused on Vercel preview and production, where it
   can't work. Each rejected plan is logged as `itineraries.plan_rejected`. The log holds the server's
   messages only, with no traveller text, so models can be compared.

8. **Production uses a remote Ollama** _(amended 2026-10-15)_. On Vercel preview and production,
   `OLLAMA_BASE_URL` must be remote HTTPS, and `OLLAMA_API_KEY` (sent as a bearer token) and an explicit
   `AI_ITINERARY_MODEL` are required. The target is Ollama Cloud (`https://ollama.com/v1`), or a
   self-hosted Ollama behind an authenticating HTTPS proxy. The default timeout for a remote Ollama is
   90 s, so two attempts fit inside Vercel's 300 s function limit.

9. **The answer schema is spelled out in the prompt** _(amended 2026-10-15, prompt `itinerary-v2`)_.
   Ollama Cloud ignores `response_format` (`json_schema` and `json_object`) and the native `format`
   field. `gpt-oss:120b`, `gpt-oss:20b` and `gemma4:31b` all replied in Markdown, so every production
   plan failed as `invalid_output`. With the request-narrowed JSON Schema and a "JSON only"
   instruction in the system prompt, 6 of 6 cloud calls returned valid itinerary JSON in 2–21 s. The
   API-level schema is still sent for providers that enforce it.

## Models tested (M1, 8 GB, local seed catalogue)

| Base model         | Result                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| `gemma3:4b`        | **Default.** With the narrowed schema, 3 of 3 real-app runs saved valid plans on the first try, ~45 s each |
| `qwen2.5:3b`       | Valid JSON, but often broke the multi-day and capacity rules                                               |
| `qwen3:4b`         | Timed out at 300 s ("thinking" output)                                                                     |
| `qwen2.5-coder:7b` | Timed out at 300 s: with a 16k context it spills to CPU on 8 GB                                            |

A 7B model, or `AI_PROVIDER=gateway` with Claude, should give better plans on machines that can run them.

## Alternatives considered

- **Community `ollama-ai-provider`:** uses the native API, which accepts `num_ctx` per request. But it is
  a third-party package, and the AI SDK 7 compatibility of its versions varies. Rejected for now. The
  Modelfile step covers the context problem.
- **Raising `OLLAMA_CONTEXT_LENGTH` on the server:** works, but depends on how Ollama is launched (app,
  brew service, Docker), and it is lost silently. Documented as an alternative only.
- **Exposing a developer machine through a tunnel:** rejected. It is not reliable for production, and
  it exposes an unauthenticated Ollama.

## Consequences

- Free local generation works end to end, with every ADR-0003 safety check intact. Production can use
  Ollama Cloud with only env changes.
- Ollama Cloud's free tier has an unpublished, changing quota and one concurrent request, so it fits
  low traffic only. Paid plans or the gateway are needed for real load.
- Small local models produce simpler plans than Claude, and fail some trips: the user sees the existing
  "couldn't create a valid itinerary" message. Nothing invalid is saved.
- Local generation takes about 45 s, against "usually under a minute" in the UI copy, which still holds.
- Follow-up: an evaluation set comparing models ([AI_EVALUATION](../ai/AI_EVALUATION.md)).
