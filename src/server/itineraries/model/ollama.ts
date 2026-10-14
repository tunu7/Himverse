import "server-only";

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import { createAiSdkItineraryModel } from "./ai-sdk";
import type { ItineraryModel } from "./types";

/**
 * Ollama (AI_PROVIDER=ollama) through its OpenAI-compatible API (ADR-0006):
 * local Ollama without a key, or Ollama Cloud / a self-hosted server behind an
 * auth proxy with OLLAMA_API_KEY sent as a bearer token. Structured outputs are
 * on, so Ollama constrains decoding to the itinerary JSON schema; the pipeline
 * still validates everything, as with any provider.
 */
export function createOllamaItineraryModel(options: {
  modelId: string;
  baseUrl: string;
  apiKey?: string | undefined;
  timeoutMs?: number | undefined;
}): ItineraryModel {
  const ollama = createOpenAICompatible({
    name: "ollama",
    baseURL: options.baseUrl,
    apiKey: options.apiKey,
    supportsStructuredOutputs: true,
  });
  return createAiSdkItineraryModel({
    // Recorded on versions and logs, so make the provider explicit.
    modelId: `ollama/${options.modelId}`,
    languageModel: ollama.chatModel(options.modelId),
    timeoutMs: options.timeoutMs,
  });
}
