import "server-only";

import {
  generateText,
  type JSONSchema7,
  jsonSchema,
  type LanguageModel,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
} from "ai";

import { z } from "zod";

import { logger } from "@/lib/logger";
import {
  type DraftConstraints,
  type ItineraryDraft,
  itineraryDraftSchema,
  itineraryDraftSchemaFor,
} from "@/server/itineraries/schemas";

import { type ItineraryModel, ModelError } from "./types";

/**
 * Provider-agnostic AI SDK 7 adapter. Structured output via
 * generateText + Output.object; errors are mapped to ModelError so the pipeline
 * never sees provider-specific types. Provider factories (gateway.ts,
 * ollama.ts) only build the LanguageModel; tests inject MockLanguageModelV4
 * from "ai/test".
 */
export function createAiSdkItineraryModel(options: {
  modelId: string;
  languageModel: LanguageModel;
  timeoutMs?: number | undefined;
}): ItineraryModel {
  const model = options.languageModel;

  return {
    id: options.modelId,
    timeoutMs: options.timeoutMs,
    async generate(request) {
      try {
        const result = await generateText({
          model,
          system: request.system,
          prompt: request.prompt,
          output: Output.object({ schema: outputSchema(request.constraints) }),
          maxOutputTokens: request.maxOutputTokens,
          timeout: request.timeoutMs,
          maxRetries: 1,
        });
        return {
          draft: result.output,
          model: options.modelId,
          usage: { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens },
        };
      } catch (error) {
        throw toModelError(error);
      }
    },
  };
}

/**
 * The model is asked for the request-narrowed schema (exact day count, known
 * aliases only), but the answer is checked against the general schema. Models
 * without constrained decoding that slip (e.g. an unknown alias) then reach
 * validate.ts, whose specific errors drive a better repair prompt than a
 * generic "invalid JSON".
 */
function outputSchema(constraints: DraftConstraints | undefined) {
  if (!constraints) return itineraryDraftSchema;
  return jsonSchema<ItineraryDraft>(
    z.toJSONSchema(itineraryDraftSchemaFor(constraints), { target: "draft-7" }) as JSONSchema7,
    {
      validate: (value) => {
        const parsed = itineraryDraftSchema.safeParse(value);
        return parsed.success
          ? { success: true, value: parsed.data }
          : { success: false, error: parsed.error };
      },
    },
  );
}

function toModelError(error: unknown): ModelError {
  if (NoObjectGeneratedError.isInstance(error) || NoOutputGeneratedError.isInstance(error)) {
    return new ModelError("invalid_output", { cause: error });
  }
  const name = error instanceof Error ? error.name : "";
  if (name === "AbortError" || name === "TimeoutError") {
    return new ModelError("timeout", { cause: error });
  }
  // Record why the provider refused (auth, billing, rate limit, outage) so it's
  // visible in logs; users only see the generic "unavailable" message.
  const details = (error ?? {}) as { statusCode?: unknown; type?: unknown; message?: unknown };
  logger.error("itineraries.model_call_failed", {
    errorName: name || typeof error,
    status: typeof details.statusCode === "number" ? details.statusCode : undefined,
    errorType: typeof details.type === "string" ? details.type : undefined,
    detail: typeof details.message === "string" ? details.message.slice(0, 300) : undefined,
  });
  return new ModelError("unavailable", { cause: error });
}
