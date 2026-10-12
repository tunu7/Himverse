import "server-only";

import { getAiEnv } from "@/lib/env.server";

import { createGatewayItineraryModel } from "./gateway";
import { createMockItineraryModel } from "./mock";
import type { ItineraryModel } from "./types";

/** The configured itinerary model (AI_PROVIDER). The mock is refused in production by getAiEnv. */
export function getItineraryModel(): ItineraryModel {
  const env = getAiEnv();
  if (env.AI_PROVIDER === "mock") {
    return createMockItineraryModel();
  }
  return createGatewayItineraryModel({
    modelId: env.AI_ITINERARY_MODEL,
    apiKey: env.AI_GATEWAY_API_KEY,
  });
}
