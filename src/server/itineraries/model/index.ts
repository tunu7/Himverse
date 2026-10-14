import "server-only";

import { getAiEnv } from "@/lib/env.server";

import { createGatewayItineraryModel } from "./gateway";
import { createMockItineraryModel } from "./mock";
import { createOllamaItineraryModel } from "./ollama";
import type { ItineraryModel } from "./types";

/**
 * The configured itinerary model: AI_PROVIDER picks the backend and
 * AI_ITINERARY_MODEL the model, so switching is an env change, not a code
 * change. The mock is refused in production by getAiEnv.
 */
export function getItineraryModel(): ItineraryModel {
  const env = getAiEnv();
  switch (env.AI_PROVIDER) {
    case "mock":
      return createMockItineraryModel();
    case "ollama":
      return createOllamaItineraryModel({
        modelId: env.AI_ITINERARY_MODEL,
        baseUrl: env.OLLAMA_BASE_URL,
        timeoutMs: env.AI_MODEL_TIMEOUT_MS,
      });
    case "gateway":
      return createGatewayItineraryModel({
        modelId: env.AI_ITINERARY_MODEL,
        apiKey: env.AI_GATEWAY_API_KEY,
        timeoutMs: env.AI_MODEL_TIMEOUT_MS,
      });
  }
}
