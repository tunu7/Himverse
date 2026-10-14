import "server-only";

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import { createAiSdkItineraryModel } from "./ai-sdk";
import type { ItineraryModel } from "./types";

/**
 * Ollama (AI_PROVIDER=ollama): free local or self-hosted models through
 * Ollama's OpenAI-compatible API (ADR-0006). No API key. Structured outputs are
 * on, so Ollama constrains decoding to the itinerary JSON schema; the pipeline
 * still validates everything, as with any provider.
 */
export function createOllamaItineraryModel(options: {
  modelId: string;
  baseUrl: string;
  timeoutMs?: number | undefined;
}): ItineraryModel {
  const ollama = createOpenAICompatible({
    name: "ollama",
    baseURL: options.baseUrl,
    supportsStructuredOutputs: true,
  });
  return createAiSdkItineraryModel({
    // Recorded on versions and logs, so make the provider explicit.
    modelId: `ollama/${options.modelId}`,
    languageModel: ollama.chatModel(options.modelId),
    timeoutMs: options.timeoutMs,
  });
}
