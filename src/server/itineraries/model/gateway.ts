import "server-only";

import {
  createGateway,
  gateway,
  generateText,
  type LanguageModel,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
} from "ai";

import { itineraryDraftSchema } from "@/server/itineraries/schemas";

import { type ItineraryModel, ModelError } from "./types";

/**
 * Vercel AI Gateway adapter (AI SDK 7). Structured output via
 * generateText + Output.object; errors are mapped to ModelError so the pipeline
 * never sees provider-specific types. `languageModel` lets tests inject
 * MockLanguageModelV4 from "ai/test".
 */
export function createGatewayItineraryModel(options: {
  modelId: string;
  apiKey?: string | undefined;
  languageModel?: LanguageModel;
}): ItineraryModel {
  const model =
    options.languageModel ??
    (options.apiKey
      ? createGateway({ apiKey: options.apiKey })(options.modelId)
      : gateway(options.modelId));

  return {
    id: options.modelId,
    async generate(request) {
      try {
        const result = await generateText({
          model,
          system: request.system,
          prompt: request.prompt,
          output: Output.object({ schema: itineraryDraftSchema }),
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

function toModelError(error: unknown): ModelError {
  if (NoObjectGeneratedError.isInstance(error) || NoOutputGeneratedError.isInstance(error)) {
    return new ModelError("invalid_output", { cause: error });
  }
  const name = error instanceof Error ? error.name : "";
  if (name === "AbortError" || name === "TimeoutError") {
    return new ModelError("timeout", { cause: error });
  }
  return new ModelError("unavailable", { cause: error });
}
